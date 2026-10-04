import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { nowArgentinaDateTime } from '../common/argentina-datetime'
import { DbService } from '../db/db.service'
import { nameToInvitationSlug } from './invitation-slug'
import { type ImportFileMeta, recordsFromImportFile } from './invitation-import-file'

export type InvitationStatus = 'pending' | 'yes' | 'no' | 'unsure'
export type GuestSide = 'vanesa' | 'augusto' | 'patricia'

export type Invitation = {
  id: number
  name: string
  token: string
  slug: string
  status: InvitationStatus
  guestSide: GuestSide | null
  allowsPlusOne: boolean
  plusOneName: string | null
  hasDietaryRestrictions: boolean | null
  dietaryRestrictions: string | null
  email: string | null
  emailSentAt: string | null
  respondedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type RsvpInput = {
  status: InvitationStatus
  plusOneName?: string | null
  hasDietaryRestrictions: boolean
  dietaryRestrictions?: string | null
}

export type BulkImportRow = {
  name: string
  email?: string | null
  guestSide: GuestSide
  allowsPlusOne: boolean
}

export type BulkImportError = {
  row: number
  message: string
}

export type BulkImportResult = {
  created: Invitation[]
  errors: BulkImportError[]
  summary: { ok: number; failed: number }
}

export type BulkImportPreviewRow = BulkImportRow & {
  row: number
}

export type BulkImportExistingMatch = BulkImportPreviewRow & {
  existingId: number
  existingName: string
}

export type BulkImportPreviewResult = {
  nuevos: BulkImportPreviewRow[]
  existentes: BulkImportExistingMatch[]
  errores: BulkImportError[]
  resumen: { nuevos: number; existentes: number; invalidos: number }
}

type Row = {
  id: number
  name: string
  token: string
  slug: string | null
  status: string
  guest_side: string | null
  allows_plus_one: number
  plus_one_name: string | null
  has_dietary_restrictions: number | null
  dietary_restrictions: string | null
  email: string | null
  email_sent_at: string | null
  responded_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function parseGuestSide(value: string | null | undefined): GuestSide | null {
  const v = (value ?? '').trim().toLowerCase()
  if (v === 'vanesa' || v === 'novia') return 'vanesa'
  if (v === 'augusto' || v === 'novio') return 'augusto'
  if (v === 'patricia') return 'patricia'
  return null
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new BadRequestException('invalid email format')
  }
  return trimmed.toLowerCase()
}

function toInvitation(row: Row): Invitation {
  return {
    id: Number(row.id),
    name: String(row.name),
    token: String(row.token),
    slug: String(row.slug ?? nameToInvitationSlug(String(row.name))),
    status: row.status as InvitationStatus,
    guestSide: parseGuestSide(row.guest_side),
    allowsPlusOne: Number(row.allows_plus_one) === 1,
    plusOneName: row.plus_one_name ? String(row.plus_one_name) : null,
    hasDietaryRestrictions:
      row.has_dietary_restrictions == null ? null : Number(row.has_dietary_restrictions) === 1,
    dietaryRestrictions: row.dietary_restrictions ? String(row.dietary_restrictions) : null,
    email: row.email ? String(row.email) : null,
    emailSentAt: row.email_sent_at ? String(row.email_sent_at) : null,
    respondedAt: row.responded_at ? String(row.responded_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }
}

const SELECT_COLUMNS = `id, name, token, slug, status, guest_side, allows_plus_one, plus_one_name,
       has_dietary_restrictions, dietary_restrictions, email, email_sent_at,
       responded_at, created_at, updated_at, deleted_at`

function parseAllowsPlusOne(raw: string | undefined): boolean | null {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return null
  if (['si', 'sí', 'yes', 'true', '1', 'pareja', 'con pareja'].includes(value)) return true
  if (['no', 'false', '0', 'solo', 'sin pareja'].includes(value)) return false
  return null
}

function pickField(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.entries(record).find(([k]) => k.trim().toLowerCase() === key)
    if (found) return found[1]?.trim() ?? ''
  }
  return ''
}

function normalizeGuestName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Invitados PATA / lado Patricia (migración idempotente). */
const PATRICIA_SIDE_NAME_KEYS = new Set(
  [
    'Florencia De Gamas',
    'Silvia',
    'Dora Marcovich',
    'Isabel Larcade',
    'Mateo Larcade',
    'Graciela Dozo',
    'María',
    'Laura Sende',
  ].map(normalizeGuestName),
)

@Injectable()
export class InvitationsService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
    await this.applyPatriciaSideGuests()
  }

  /** Asigna guest_side patricia a invitados PATA definidos en el proyecto. */
  async applyPatriciaSideGuests(): Promise<void> {
    const rs = await this.db.execute(
      `SELECT id, name, guest_side FROM invitations WHERE deleted_at IS NULL`,
    )
    const now = nowArgentinaDateTime()
    for (const raw of rs.rows as { id?: number; name?: string; guest_side?: string | null }[]) {
      const id = Number(raw.id)
      const key = normalizeGuestName(String(raw.name ?? ''))
      if (!PATRICIA_SIDE_NAME_KEYS.has(key)) continue
      if (raw.guest_side === 'patricia') continue
      await this.db.execute(
        `UPDATE invitations SET guest_side = 'patricia', updated_at = ? WHERE id = ?`,
        [now, id],
      )
    }
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        allows_plus_one INTEGER NOT NULL DEFAULT 0,
        plus_one_name TEXT,
        responded_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `)
    await this.db.ensureColumn('invitations', 'has_dietary_restrictions', 'INTEGER')
    await this.db.ensureColumn('invitations', 'dietary_restrictions', 'TEXT')
    await this.db.ensureColumn('invitations', 'guest_side', 'TEXT')
    await this.db.ensureColumn('invitations', 'email', 'TEXT')
    await this.db.ensureColumn('invitations', 'email_sent_at', 'TEXT')
    await this.db.ensureColumn('invitations', 'slug', 'TEXT')
    await this.db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS invitations_slug_unique ON invitations(slug) WHERE slug IS NOT NULL AND deleted_at IS NULL`,
    )
    await this.backfillSlugs()
  }

  private async slugInUse(slug: string, excludeId?: number): Promise<boolean> {
    const rs = await this.db.execute(
      `SELECT 1 FROM invitations WHERE slug = ? AND deleted_at IS NULL${excludeId != null ? ' AND id != ?' : ''} LIMIT 1`,
      excludeId != null ? [slug, excludeId] : [slug],
    )
    return rs.rows.length > 0
  }

  private async allocateSlug(name: string, excludeId?: number): Promise<string> {
    const base = nameToInvitationSlug(name)
    let candidate = base
    let suffix = 2
    while (await this.slugInUse(candidate, excludeId)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  private async backfillSlugs(): Promise<void> {
    const rs = await this.db.execute(
      `SELECT id, name, slug FROM invitations WHERE deleted_at IS NULL AND (slug IS NULL OR TRIM(slug) = '')`,
    )
    for (const raw of rs.rows as { id?: number; name?: string }[]) {
      const id = Number(raw.id)
      const name = String(raw.name ?? '')
      const slug = await this.allocateSlug(name)
      const now = nowArgentinaDateTime()
      await this.db.execute(`UPDATE invitations SET slug = ?, updated_at = ? WHERE id = ?`, [slug, now, id])
    }
  }

  async list(): Promise<Invitation[]> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE deleted_at IS NULL
       ORDER BY lower(name) ASC, id ASC`,
    )
    return rs.rows.map((r) => toInvitation(r as unknown as Row))
  }

  async create(
    name: string,
    allowsPlusOne: boolean,
    guestSide?: GuestSide | null,
    email?: string | null,
  ): Promise<Invitation> {
    const value = name.trim()
    if (!value) throw new BadRequestException('name is required')
    const side = guestSide == null ? null : parseGuestSide(guestSide)
    if (guestSide != null && side == null) {
      throw new BadRequestException('guestSide must be vanesa, augusto or patricia')
    }
    const emailValue = email == null || email === '' ? null : normalizeEmail(email)
    const token = randomBytes(16).toString('hex')
    const slug = await this.allocateSlug(value)
    const now = nowArgentinaDateTime()
    const rs = await this.db.execute(
      `INSERT INTO invitations (name, token, slug, status, guest_side, allows_plus_one, email, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
       RETURNING ${SELECT_COLUMNS}`,
      [value, token, slug, side, allowsPlusOne ? 1 : 0, emailValue, now, now],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
  }

  async bulkCreate(rows: BulkImportRow[]): Promise<BulkImportResult> {
    const created: Invitation[] = []
    const errors: BulkImportError[] = []

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const row = rows[i]
      try {
        const inv = await this.create(row.name, row.allowsPlusOne, row.guestSide, row.email)
        created.push(inv)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ row: rowNum, message })
      }
    }

    return {
      created,
      errors,
      summary: { ok: created.length, failed: errors.length },
    }
  }

  parseImportBuffer(
    buffer: Buffer,
    meta?: ImportFileMeta,
  ): { validRows: BulkImportPreviewRow[]; errors: BulkImportError[] } {
    const records = recordsFromImportFile(buffer, meta)

    const validRows: BulkImportPreviewRow[] = []
    const errors: BulkImportError[] = []

    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2
      const record = records[i]
      const name = pickField(record, 'nombre', 'name')
      const emailRaw = pickField(record, 'email', 'correo', 'mail')
      const ladoRaw = pickField(record, 'lado', 'guestside', 'guest_side')
      const invitaRaw = pickField(record, 'invita', 'allowsplusone', 'allows_plus_one', 'pareja')

      if (!name) {
        errors.push({ row: rowNum, message: 'nombre is required' })
        continue
      }

      const guestSide = parseGuestSide(ladoRaw.toLowerCase())
      if (!guestSide) {
        errors.push({ row: rowNum, message: 'lado must be vanesa, augusto or patricia' })
        continue
      }

      const allowsPlusOne = parseAllowsPlusOne(invitaRaw)
      if (allowsPlusOne == null) {
        errors.push({ row: rowNum, message: 'invita must be si/no, true/false, pareja/solo, or 1/0' })
        continue
      }

      let email: string | null = null
      if (emailRaw) {
        try {
          email = normalizeEmail(emailRaw)
        } catch {
          errors.push({ row: rowNum, message: 'invalid email format' })
          continue
        }
      }

      validRows.push({ row: rowNum, name, email, guestSide, allowsPlusOne })
    }

    return { validRows, errors }
  }

  async previewCsvImport(buffer: Buffer, meta?: ImportFileMeta): Promise<BulkImportPreviewResult> {
    const { validRows, errors } = this.parseImportBuffer(buffer, meta)
    const existing = await this.list()
    const byName = new Map<string, Invitation>()
    for (const inv of existing) {
      byName.set(normalizeGuestName(inv.name), inv)
    }

    const nuevos: BulkImportPreviewRow[] = []
    const existentes: BulkImportExistingMatch[] = []

    for (const row of validRows) {
      const match = byName.get(normalizeGuestName(row.name))
      if (match) {
        existentes.push({
          ...row,
          existingId: match.id,
          existingName: match.name,
        })
      } else {
        nuevos.push(row)
      }
    }

    return {
      nuevos,
      existentes,
      errores: errors,
      resumen: {
        nuevos: nuevos.length,
        existentes: existentes.length,
        invalidos: errors.length,
      },
    }
  }

  async importFromCsv(buffer: Buffer, meta?: ImportFileMeta): Promise<BulkImportResult> {
    const preview = await this.previewCsvImport(buffer, meta)
    return this.bulkCreateRows(preview.nuevos)
  }

  async bulkCreateRows(rows: BulkImportRow[]): Promise<BulkImportResult> {
    const result = await this.bulkCreate(rows)
    return result
  }

  async getById(id: number): Promise<Invitation> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE id = ? AND deleted_at IS NULL`,
      [id],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitation not found')
    return toInvitation(row as unknown as Row)
  }

  async update(
    id: number,
    name: string,
    allowsPlusOne: boolean,
    guestSide?: GuestSide | null,
    email?: string | null | undefined,
  ): Promise<Invitation> {
    const current = await this.getById(id)
    const value = name.trim()
    if (!value) throw new BadRequestException('name is required')
    const side = guestSide == null ? null : parseGuestSide(guestSide)
    if (guestSide != null && side == null) {
      throw new BadRequestException('guestSide must be vanesa, augusto or patricia')
    }
    const plusOneName = allowsPlusOne ? current.plusOneName : null
    const emailValue =
      email === undefined ? current.email : email == null || email === '' ? null : normalizeEmail(email)
    const slug =
      value === current.name ? current.slug : await this.allocateSlug(value, id)
    const now = nowArgentinaDateTime()
    const rs = await this.db.execute(
      `UPDATE invitations
       SET name = ?,
           slug = ?,
           guest_side = ?,
           allows_plus_one = ?,
           plus_one_name = ?,
           email = ?,
           updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [value, slug, side, allowsPlusOne ? 1 : 0, plusOneName, emailValue, now, id],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
  }

  async markEmailSent(id: number): Promise<Invitation> {
    const now = nowArgentinaDateTime()
    const rs = await this.db.execute(
      `UPDATE invitations
       SET email_sent_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [now, now, id],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitation not found')
    return toInvitation(row as unknown as Row)
  }

  async listPendingEmail(limit = 50): Promise<Invitation[]> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE deleted_at IS NULL
         AND email IS NOT NULL
         AND TRIM(email) != ''
         AND email_sent_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [limit],
    )
    return rs.rows.map((r) => toInvitation(r as unknown as Row))
  }

  /** Resolve by URL slug (`/i/maria-lopez`) or legacy hex token. */
  async getByPublicKey(publicKey: string): Promise<Invitation> {
    const key = decodeURIComponent(publicKey).trim()
    if (!key) throw new NotFoundException('Invitation not found')
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE deleted_at IS NULL AND (slug = ? OR token = ?)
       LIMIT 1`,
      [key, key],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitation not found')
    return toInvitation(row as unknown as Row)
  }

  async getByToken(token: string): Promise<Invitation> {
    return this.getByPublicKey(token)
  }

  async resetRsvp(id: number): Promise<Invitation> {
    await this.getById(id)
    const now = nowArgentinaDateTime()
    const rs = await this.db.execute(
      `UPDATE invitations
       SET status = 'pending',
           plus_one_name = NULL,
           has_dietary_restrictions = NULL,
           dietary_restrictions = NULL,
           responded_at = NULL,
           updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [now, id],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitation not found')
    return toInvitation(row as unknown as Row)
  }

  async rsvp(publicKey: string, input: RsvpInput): Promise<Invitation> {
    const current = await this.getByPublicKey(publicKey)
    const status = input.status
    if (!['yes', 'no', 'unsure'].includes(status)) {
      throw new BadRequestException('invalid status')
    }

    let plusOneName: string | null = null
    if (status === 'yes' && current.allowsPlusOne) {
      const n = (input.plusOneName || '').trim()
      plusOneName = n || null
    }

    if (typeof input.hasDietaryRestrictions !== 'boolean') {
      throw new BadRequestException('hasDietaryRestrictions must be a boolean')
    }
    const hasDietaryRestrictions = input.hasDietaryRestrictions ? 1 : 0
    let dietaryRestrictions: string | null = null
    if (hasDietaryRestrictions === 1) {
      const detail = (input.dietaryRestrictions || '').trim()
      dietaryRestrictions = detail || null
    }

    const now = nowArgentinaDateTime()
    const rs = await this.db.execute(
      `UPDATE invitations
       SET status = ?,
           plus_one_name = ?,
           has_dietary_restrictions = ?,
           dietary_restrictions = ?,
           responded_at = ?,
           updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [status, plusOneName, hasDietaryRestrictions, dietaryRestrictions, now, now, current.id],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
  }

  async softDelete(id: number): Promise<{ ok: true }> {
    const now = nowArgentinaDateTime()
    await this.db.execute(
      `UPDATE invitations SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    )
    return { ok: true }
  }
}
