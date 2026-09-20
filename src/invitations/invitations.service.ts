import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { parse } from 'csv-parse/sync'
import { DbService } from '../db/db.service'

export type InvitationStatus = 'pending' | 'yes' | 'no' | 'unsure'
export type GuestSide = 'vanesa' | 'augusto'

export type Invitation = {
  id: number
  name: string
  token: string
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
  if (value === 'vanesa' || value === 'augusto') return value
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

const SELECT_COLUMNS = `id, name, token, status, guest_side, allows_plus_one, plus_one_name,
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

@Injectable()
export class InvitationsService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
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
  }

  async list(): Promise<Invitation[]> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC`,
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
      throw new BadRequestException('guestSide must be vanesa or augusto')
    }
    const emailValue = email == null || email === '' ? null : normalizeEmail(email)
    const token = randomBytes(16).toString('hex')
    const rs = await this.db.execute(
      `INSERT INTO invitations (name, token, status, guest_side, allows_plus_one, email, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, datetime('now'), datetime('now'))
       RETURNING ${SELECT_COLUMNS}`,
      [value, token, side, allowsPlusOne ? 1 : 0, emailValue],
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

  parseCsvBuffer(buffer: Buffer): { validRows: BulkImportPreviewRow[]; errors: BulkImportError[] } {
    let text = buffer.toString('utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

    let records: Record<string, string>[]
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[]
    } catch {
      throw new BadRequestException('invalid CSV format')
    }

    if (records.length === 0) {
      throw new BadRequestException('CSV has no data rows')
    }

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
        errors.push({ row: rowNum, message: 'lado must be vanesa or augusto' })
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

  async previewCsvImport(buffer: Buffer): Promise<BulkImportPreviewResult> {
    const { validRows, errors } = this.parseCsvBuffer(buffer)
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

  async importFromCsv(buffer: Buffer): Promise<BulkImportResult> {
    const preview = await this.previewCsvImport(buffer)
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
      throw new BadRequestException('guestSide must be vanesa or augusto')
    }
    const plusOneName = allowsPlusOne ? current.plusOneName : null
    const emailValue =
      email === undefined ? current.email : email == null || email === '' ? null : normalizeEmail(email)
    const rs = await this.db.execute(
      `UPDATE invitations
       SET name = ?,
           guest_side = ?,
           allows_plus_one = ?,
           plus_one_name = ?,
           email = ?,
           updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [value, side, allowsPlusOne ? 1 : 0, plusOneName, emailValue, id],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
  }

  async markEmailSent(id: number): Promise<Invitation> {
    const rs = await this.db.execute(
      `UPDATE invitations
       SET email_sent_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [id],
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

  async getByToken(token: string): Promise<Invitation> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitations
       WHERE token = ? AND deleted_at IS NULL`,
      [token.trim()],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitation not found')
    return toInvitation(row as unknown as Row)
  }

  async rsvp(token: string, input: RsvpInput): Promise<Invitation> {
    const current = await this.getByToken(token)
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

    const rs = await this.db.execute(
      `UPDATE invitations
       SET status = ?,
           plus_one_name = ?,
           has_dietary_restrictions = ?,
           dietary_restrictions = ?,
           responded_at = datetime('now'),
           updated_at = datetime('now')
       WHERE token = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [status, plusOneName, hasDietaryRestrictions, dietaryRestrictions, token.trim()],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
  }

  async softDelete(id: number): Promise<{ ok: true }> {
    await this.db.execute(
      `UPDATE invitations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [id],
    )
    return { ok: true }
  }
}
