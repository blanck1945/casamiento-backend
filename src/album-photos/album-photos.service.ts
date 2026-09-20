import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import type { Response } from 'express'
import type { Express } from 'express'
import { DbService } from '../db/db.service'
import { InvitationsService } from '../invitations/invitations.service'
import { AlbumS3Storage } from './album-s3.storage'
import {
  isAllowedUpload,
  maxBytesForMime,
  maxMbForMime,
  mediaKindLabel,
} from './album-upload.limits'

export type AlbumPhoto = {
  id: number
  invitationId: number | null
  invitationName: string | null
  originalName: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type AlbumPhotoListItem = AlbumPhoto & {
  url: string | null
}

/** Guest uploads: S3 when `ALBUM_S3_BUCKET` is set, otherwise local `.data/album-photos`. */
@Injectable()
export class AlbumPhotosService implements OnModuleInit {
  private readonly log = new Logger(AlbumPhotosService.name)
  private readonly localDir = resolve(process.cwd(), '.data/album-photos')

  constructor(
    private readonly db: DbService,
    private readonly invitations: InvitationsService,
    private readonly s3: AlbumS3Storage,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    try {
      await this.ensureSchema()
    } catch (err) {
      this.log.warn(`could not create album_photos schema: ${String(err)}`)
    }
    if (this.s3.enabled) {
      this.log.log('Album storage: S3')
    } else {
      this.log.log('Album storage: local disk (.data/album-photos)')
    }
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS album_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invitation_id INTEGER,
        invitation_name TEXT,
        original_name TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  async upload(file: Express.Multer.File | undefined, token?: string): Promise<{ ok: true; id: number; originalName: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required')
    }
    const mimeType = (file.mimetype || '').toLowerCase()
    const originalName = file.originalname || ''

    if (!isAllowedUpload(mimeType, originalName)) {
      throw new UnsupportedMediaTypeException(
        'Only images or videos are allowed (JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, WebM)',
      )
    }

    const maxBytes = maxBytesForMime(mimeType, originalName)
    if (file.size > maxBytes) {
      const kind = mediaKindLabel(mimeType, originalName)
      throw new PayloadTooLargeException(`The ${kind} exceeds ${maxMbForMime(mimeType, originalName)} MB`)
    }

    let invitationId: number | null = null
    let invitationName: string | null = null
    if (token) {
      try {
        const inv = await this.invitations.getByToken(token)
        invitationId = inv.id
        invitationName = inv.name
      } catch {
        // Invalid token: still store the upload without guest association.
      }
    }

    const ext = this.safeExt(file.originalname, mimeType)
    const uid = randomBytes(8).toString('hex')
    let storageKey: string

    if (this.s3.enabled) {
      const key = this.s3.objectKey(uid, ext)
      await this.s3.putObject(key, Buffer.from(file.buffer), mimeType)
      storageKey = `s3:${key}`
    } else {
      mkdirSync(this.localDir, { recursive: true })
      const localPath = resolve(this.localDir, `${uid}${ext}`)
      writeFileSync(localPath, Buffer.from(file.buffer))
      storageKey = `local:${uid}${ext}`
    }

    await this.ensureSchema()
    const rs = await this.db.execute(
      `INSERT INTO album_photos
        (invitation_id, invitation_name, original_name, storage_key, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       RETURNING id, original_name`,
      [invitationId, invitationName, file.originalname || `photo${ext}`, storageKey, mimeType, file.size],
    )
    const row = rs.rows[0] as { id?: number; original_name?: string } | undefined
    if (!row?.id) throw new Error('Could not save album upload')

    return { ok: true, id: Number(row.id), originalName: String(row.original_name ?? file.originalname) }
  }

  async list(limit = 50): Promise<{ items: AlbumPhotoListItem[] }> {
    await this.ensureSchema()
    const safeLimit = Math.min(Math.max(limit, 1), 200)
    const rs = await this.db.execute(
      `SELECT id, invitation_id, invitation_name, original_name, storage_key, mime_type, size_bytes, created_at
       FROM album_photos
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT ?`,
      [safeLimit],
    )

    const items: AlbumPhotoListItem[] = []
    for (const row of rs.rows as Record<string, unknown>[]) {
      const storageKey = String(row.storage_key ?? '')
      const parsed = this.s3.parseStorageKey(storageKey)
      let url: string | null = null
      const id = Number(row.id)
      if (parsed.backend === 's3' && this.s3.enabled) {
        try {
          url = await this.s3.signedGetUrl(parsed.key)
        } catch (err) {
          this.log.warn(`could not sign URL for ${parsed.key}: ${String(err)}`)
        }
      } else if (parsed.backend === 'local') {
        url = `/api/album-photos/${id}/file`
      }

      items.push({
        id,
        invitationId: row.invitation_id == null ? null : Number(row.invitation_id),
        invitationName: row.invitation_name == null ? null : String(row.invitation_name),
        originalName: String(row.original_name ?? ''),
        storageKey,
        mimeType: String(row.mime_type ?? ''),
        sizeBytes: Number(row.size_bytes ?? 0),
        createdAt: String(row.created_at ?? ''),
        url,
      })
    }

    return { items }
  }

  async serveFile(id: number, res: Response): Promise<void> {
    await this.ensureSchema()
    const rs = await this.db.execute(
      `SELECT storage_key, mime_type, original_name FROM album_photos WHERE id = ? LIMIT 1`,
      [id],
    )
    const row = rs.rows[0] as { storage_key?: string; mime_type?: string; original_name?: string } | undefined
    if (!row?.storage_key) throw new NotFoundException('file not found')

    const parsed = this.s3.parseStorageKey(String(row.storage_key))
    const mimeType = String(row.mime_type ?? 'application/octet-stream')

    if (parsed.backend === 's3' && this.s3.enabled) {
      const signed = await this.s3.signedGetUrl(parsed.key)
      res.redirect(signed)
      return
    }

    if (parsed.backend !== 'local') throw new NotFoundException('file not available')

    const localPath = resolve(this.localDir, parsed.key)
    if (!existsSync(localPath)) throw new NotFoundException('file not found on disk')

    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    createReadStream(localPath).pipe(res)
  }

  private safeExt(originalName: string, mimeType: string): string {
    const fromName = extname(originalName || '').toLowerCase()
    if (/^\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|webm|avi)$/.test(fromName)) {
      return fromName
    }
    const byMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
      'video/x-msvideo': '.avi',
    }
    return byMime[mimeType] || '.bin'
  }
}
