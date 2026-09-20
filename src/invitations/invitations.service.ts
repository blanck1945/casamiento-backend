import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { DbService } from '../db/db.service'

export type InvitationStatus = 'pending' | 'yes' | 'no' | 'unsure'

export type Invitation = {
  id: number
  name: string
  token: string
  status: InvitationStatus
  allowsPlusOne: boolean
  plusOneName: string | null
  hasDietaryRestrictions: boolean | null
  dietaryRestrictions: string | null
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

type Row = {
  id: number
  name: string
  token: string
  status: string
  allows_plus_one: number
  plus_one_name: string | null
  has_dietary_restrictions: number | null
  dietary_restrictions: string | null
  responded_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toInvitation(row: Row): Invitation {
  return {
    id: Number(row.id),
    name: String(row.name),
    token: String(row.token),
    status: row.status as InvitationStatus,
    allowsPlusOne: Number(row.allows_plus_one) === 1,
    plusOneName: row.plus_one_name ? String(row.plus_one_name) : null,
    hasDietaryRestrictions:
      row.has_dietary_restrictions == null ? null : Number(row.has_dietary_restrictions) === 1,
    dietaryRestrictions: row.dietary_restrictions ? String(row.dietary_restrictions) : null,
    respondedAt: row.responded_at ? String(row.responded_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }
}

const SELECT_COLUMNS = `id, name, token, status, allows_plus_one, plus_one_name,
       has_dietary_restrictions, dietary_restrictions,
       responded_at, created_at, updated_at, deleted_at`

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

  async create(name: string, allowsPlusOne: boolean): Promise<Invitation> {
    const value = name.trim()
    if (!value) throw new BadRequestException('name is required')
    const token = randomBytes(16).toString('hex')
    const rs = await this.db.execute(
      `INSERT INTO invitations (name, token, status, allows_plus_one, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, datetime('now'), datetime('now'))
       RETURNING ${SELECT_COLUMNS}`,
      [value, token, allowsPlusOne ? 1 : 0],
    )
    return toInvitation(rs.rows[0] as unknown as Row)
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
