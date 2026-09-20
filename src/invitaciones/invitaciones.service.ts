import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { DbService } from '../db/db.service'

export type EstadoInvitacion = 'pendiente' | 'si' | 'no' | 'aun_no_lo_se'

export type Invitacion = {
  id: number
  nombre: string
  token: string
  estado: EstadoInvitacion
  permitePareja: boolean
  nombreAcompanante: string | null
  restriccionesAlimentariasSi: boolean | null
  restriccionesAlimentarias: string | null
  respondidoAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type RsvpInput = {
  estado: EstadoInvitacion
  nombreAcompanante?: string | null
  restriccionesAlimentariasSi: boolean
  restriccionesAlimentarias?: string | null
}

type Row = {
  id: number
  nombre: string
  token: string
  estado: string
  permite_pareja: number
  nombre_acompanante: string | null
  restricciones_alimentarias_si: number | null
  restricciones_alimentarias: string | null
  respondido_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toInvitacion(row: Row): Invitacion {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    token: String(row.token),
    estado: row.estado as EstadoInvitacion,
    permitePareja: Number(row.permite_pareja) === 1,
    nombreAcompanante: row.nombre_acompanante ? String(row.nombre_acompanante) : null,
    restriccionesAlimentariasSi:
      row.restricciones_alimentarias_si == null ? null : Number(row.restricciones_alimentarias_si) === 1,
    restriccionesAlimentarias: row.restricciones_alimentarias ? String(row.restricciones_alimentarias) : null,
    respondidoAt: row.respondido_at ? String(row.respondido_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }
}

const SELECT_COLUMNS = `id, nombre, token, estado, permite_pareja, nombre_acompanante,
       restricciones_alimentarias_si, restricciones_alimentarias,
       respondido_at, created_at, updated_at, deleted_at`

@Injectable()
export class InvitacionesService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS invitaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        permite_pareja INTEGER NOT NULL DEFAULT 0,
        nombre_acompanante TEXT,
        respondido_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT
      )
    `)
    await this.db.ensureColumn('invitaciones', 'restricciones_alimentarias_si', 'INTEGER')
    await this.db.ensureColumn('invitaciones', 'restricciones_alimentarias', 'TEXT')
  }

  async list(): Promise<Invitacion[]> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitaciones
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC`,
    )
    return rs.rows.map((r) => toInvitacion(r as unknown as Row))
  }

  async create(nombre: string, permitePareja: boolean): Promise<Invitacion> {
    const val = nombre.trim()
    if (!val) throw new BadRequestException('nombre es requerido')
    const token = randomBytes(16).toString('hex')
    const rs = await this.db.execute(
      `INSERT INTO invitaciones (nombre, token, estado, permite_pareja, created_at, updated_at)
       VALUES (?, ?, 'pendiente', ?, datetime('now'), datetime('now'))
       RETURNING ${SELECT_COLUMNS}`,
      [val, token, permitePareja ? 1 : 0],
    )
    return toInvitacion(rs.rows[0] as unknown as Row)
  }

  async getByToken(token: string): Promise<Invitacion> {
    const rs = await this.db.execute(
      `SELECT ${SELECT_COLUMNS}
       FROM invitaciones
       WHERE token = ? AND deleted_at IS NULL`,
      [token.trim()],
    )
    const row = rs.rows[0]
    if (!row) throw new NotFoundException('Invitación no encontrada')
    return toInvitacion(row as unknown as Row)
  }

  async rsvp(token: string, input: RsvpInput): Promise<Invitacion> {
    const actual = await this.getByToken(token)
    const estado = input.estado
    if (!['si', 'no', 'aun_no_lo_se'].includes(estado)) {
      throw new BadRequestException('estado inválido')
    }

    let nombreAcompanante: string | null = null
    if (estado === 'si' && actual.permitePareja) {
      const n = (input.nombreAcompanante || '').trim()
      nombreAcompanante = n || null
    }

    if (typeof input.restriccionesAlimentariasSi !== 'boolean') {
      throw new BadRequestException('restriccionesAlimentariasSi debe ser boolean')
    }
    const restriccionesAlimentariasSi = input.restriccionesAlimentariasSi ? 1 : 0
    let restriccionesAlimentarias: string | null = null
    if (restriccionesAlimentariasSi === 1) {
      const detalle = (input.restriccionesAlimentarias || '').trim()
      restriccionesAlimentarias = detalle || null
    }

    const rs = await this.db.execute(
      `UPDATE invitaciones
       SET estado = ?,
           nombre_acompanante = ?,
           restricciones_alimentarias_si = ?,
           restricciones_alimentarias = ?,
           respondido_at = datetime('now'),
           updated_at = datetime('now')
       WHERE token = ? AND deleted_at IS NULL
       RETURNING ${SELECT_COLUMNS}`,
      [estado, nombreAcompanante, restriccionesAlimentariasSi, restriccionesAlimentarias, token.trim()],
    )
    return toInvitacion(rs.rows[0] as unknown as Row)
  }

  async softDelete(id: number): Promise<{ ok: true }> {
    await this.db.execute(
      `UPDATE invitaciones SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [id],
    )
    return { ok: true }
  }
}
