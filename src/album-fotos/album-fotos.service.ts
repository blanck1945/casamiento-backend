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
import { InvitacionesService } from '../invitaciones/invitaciones.service'
import { AlbumS3Storage } from './album-s3.storage'
import {
  isAllowedUpload,
  maxBytesForMime,
  maxMbForMime,
  mediaKindLabel,
} from './album-upload.limits'

export type AlbumFoto = {
  id: number
  invitacionId: number | null
  invitacionNombre: string | null
  originalName: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export type AlbumFotoListItem = AlbumFoto & {
  url: string | null
}

/**
 * Guarda fotos/videos subidos por invitados.
 * Con `ALBUM_S3_BUCKET` → S3. Sin bucket → disco local en `.data/album-fotos`.
 */
@Injectable()
export class AlbumFotosService implements OnModuleInit {
  private readonly log = new Logger(AlbumFotosService.name)
  private readonly localDir = resolve(process.cwd(), '.data/album-fotos')

  constructor(
    private readonly db: DbService,
    private readonly invitaciones: InvitacionesService,
    private readonly s3: AlbumS3Storage,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    try {
      await this.ensureSchema()
    } catch (err) {
      this.log.warn(`no pude crear el esquema de album_fotos: ${String(err)}`)
    }
    if (this.s3.enabled) {
      this.log.log('Almacenamiento de álbum: S3')
    } else {
      this.log.log('Almacenamiento de álbum: disco local (.data/album-fotos)')
    }
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS album_fotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invitacion_id INTEGER,
        invitacion_nombre TEXT,
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
      throw new BadRequestException('archivo es requerido')
    }
    const mimeType = (file.mimetype || '').toLowerCase()
    const originalName = file.originalname || ''

    if (!isAllowedUpload(mimeType, originalName)) {
      throw new UnsupportedMediaTypeException(
        'Solo imágenes o videos (JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, WebM)',
      )
    }

    const maxBytes = maxBytesForMime(mimeType, originalName)
    if (file.size > maxBytes) {
      const kind = mediaKindLabel(mimeType, originalName)
      throw new PayloadTooLargeException(`El ${kind} supera ${maxMbForMime(mimeType, originalName)} MB`)
    }

    let invitacionId: number | null = null
    let invitacionNombre: string | null = null
    if (token) {
      try {
        const inv = await this.invitaciones.getByToken(token)
        invitacionId = inv.id
        invitacionNombre = inv.nombre
      } catch {
        // token inválido: guardamos la foto igual, sin asociarla a un invitado.
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
      `INSERT INTO album_fotos
        (invitacion_id, invitacion_nombre, original_name, storage_key, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       RETURNING id, original_name`,
      [invitacionId, invitacionNombre, file.originalname || `foto${ext}`, storageKey, mimeType, file.size],
    )
    const row = rs.rows[0] as { id?: number; original_name?: string } | undefined
    if (!row?.id) throw new Error('No se pudo registrar la foto')

    return { ok: true, id: Number(row.id), originalName: String(row.original_name ?? file.originalname) }
  }

  /** Listado para la librería virtual (URLs firmadas si están en S3). */
  async list(limit = 50): Promise<{ items: AlbumFotoListItem[] }> {
    await this.ensureSchema()
    const safeLimit = Math.min(Math.max(limit, 1), 200)
    const rs = await this.db.execute(
      `SELECT id, invitacion_id, invitacion_nombre, original_name, storage_key, mime_type, size_bytes, created_at
       FROM album_fotos
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT ?`,
      [safeLimit],
    )

    const items: AlbumFotoListItem[] = []
    for (const row of rs.rows as Record<string, unknown>[]) {
      const storageKey = String(row.storage_key ?? '')
      const parsed = this.s3.parseStorageKey(storageKey)
      let url: string | null = null
      const id = Number(row.id)
      if (parsed.backend === 's3' && this.s3.enabled) {
        try {
          url = await this.s3.signedGetUrl(parsed.key)
        } catch (err) {
          this.log.warn(`no pude firmar URL para ${parsed.key}: ${String(err)}`)
        }
      } else if (parsed.backend === 'local') {
        url = `/api/album-fotos/${id}/file`
      }

      items.push({
        id,
        invitacionId: row.invitacion_id == null ? null : Number(row.invitacion_id),
        invitacionNombre: row.invitacion_nombre == null ? null : String(row.invitacion_nombre),
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
      `SELECT storage_key, mime_type, original_name FROM album_fotos WHERE id = ? LIMIT 1`,
      [id],
    )
    const row = rs.rows[0] as { storage_key?: string; mime_type?: string; original_name?: string } | undefined
    if (!row?.storage_key) throw new NotFoundException('archivo no encontrado')

    const parsed = this.s3.parseStorageKey(String(row.storage_key))
    const mimeType = String(row.mime_type ?? 'application/octet-stream')

    if (parsed.backend === 's3' && this.s3.enabled) {
      const signed = await this.s3.signedGetUrl(parsed.key)
      res.redirect(signed)
      return
    }

    if (parsed.backend !== 'local') throw new NotFoundException('archivo no disponible')

    const localPath = resolve(this.localDir, parsed.key)
    if (!existsSync(localPath)) throw new NotFoundException('archivo no encontrado en disco')

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
