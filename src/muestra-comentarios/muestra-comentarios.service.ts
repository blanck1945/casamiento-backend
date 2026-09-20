import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { DbService } from '../db/db.service'

export type MuestraComentario = {
  id: number
  sectionId: string
  sectionLabel: string
  texto: string
  xPct: number
  yPct: number
  createdAt: string
}

export type CreateMuestraComentarioInput = {
  sectionId: string
  sectionLabel: string
  texto: string
  xPct: number
  yPct: number
}

type Row = {
  id: number
  section_id: string
  section_label: string
  texto: string
  x_pct: number
  y_pct: number
  created_at: string
}

function toComentario(row: Row): MuestraComentario {
  return {
    id: Number(row.id),
    sectionId: String(row.section_id),
    sectionLabel: String(row.section_label),
    texto: String(row.texto),
    xPct: Number(row.x_pct),
    yPct: Number(row.y_pct),
    createdAt: String(row.created_at),
  }
}

/** Comentarios "pin" del panel de testing /muestra (persistidos para compartir feedback). */
@Injectable()
export class MuestraComentariosService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS muestra_comentarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id TEXT NOT NULL,
        section_label TEXT NOT NULL,
        texto TEXT NOT NULL,
        x_pct REAL NOT NULL,
        y_pct REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  async list(): Promise<MuestraComentario[]> {
    const rs = await this.db.execute(
      `SELECT id, section_id, section_label, texto, x_pct, y_pct, created_at
       FROM muestra_comentarios
       ORDER BY created_at DESC, id DESC`,
    )
    return rs.rows.map((r) => toComentario(r as unknown as Row))
  }

  async create(input: CreateMuestraComentarioInput): Promise<MuestraComentario> {
    const texto = (input.texto || '').trim()
    if (!texto) throw new BadRequestException('texto es requerido')
    const sectionId = (input.sectionId || 'pagina').trim() || 'pagina'
    const sectionLabel = (input.sectionLabel || 'Página').trim() || 'Página'
    const xPct = Number.isFinite(input.xPct) ? Number(input.xPct) : 0
    const yPct = Number.isFinite(input.yPct) ? Number(input.yPct) : 0
    const rs = await this.db.execute(
      `INSERT INTO muestra_comentarios (section_id, section_label, texto, x_pct, y_pct, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       RETURNING id, section_id, section_label, texto, x_pct, y_pct, created_at`,
      [sectionId, sectionLabel, texto, xPct, yPct],
    )
    return toComentario(rs.rows[0] as unknown as Row)
  }

  async remove(id: number): Promise<{ ok: true }> {
    await this.db.execute(`DELETE FROM muestra_comentarios WHERE id = ?`, [id])
    return { ok: true }
  }

  async clear(): Promise<{ ok: true }> {
    await this.db.execute(`DELETE FROM muestra_comentarios`)
    return { ok: true }
  }
}
