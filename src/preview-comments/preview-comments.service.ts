import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { DbService } from '../db/db.service'

export type PreviewComment = {
  id: number
  sectionId: string
  sectionLabel: string
  text: string
  xPct: number
  yPct: number
  createdAt: string
}

export type CreatePreviewCommentInput = {
  sectionId: string
  sectionLabel: string
  text: string
  xPct: number
  yPct: number
}

type Row = {
  id: number
  section_id: string
  section_label: string
  text: string
  x_pct: number
  y_pct: number
  created_at: string
}

function toPreviewComment(row: Row): PreviewComment {
  return {
    id: Number(row.id),
    sectionId: String(row.section_id),
    sectionLabel: String(row.section_label),
    text: String(row.text),
    xPct: Number(row.x_pct),
    yPct: Number(row.y_pct),
    createdAt: String(row.created_at),
  }
}

/** Pin comments for the /preview design review panel. */
@Injectable()
export class PreviewCommentsService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS preview_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id TEXT NOT NULL,
        section_label TEXT NOT NULL,
        text TEXT NOT NULL,
        x_pct REAL NOT NULL,
        y_pct REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  async list(): Promise<PreviewComment[]> {
    const rs = await this.db.execute(
      `SELECT id, section_id, section_label, text, x_pct, y_pct, created_at
       FROM preview_comments
       ORDER BY created_at DESC, id DESC`,
    )
    return rs.rows.map((r) => toPreviewComment(r as unknown as Row))
  }

  async create(input: CreatePreviewCommentInput): Promise<PreviewComment> {
    const text = (input.text || '').trim()
    if (!text) throw new BadRequestException('text is required')
    const sectionId = (input.sectionId || 'page').trim() || 'page'
    const sectionLabel = (input.sectionLabel || 'Page').trim() || 'Page'
    const xPct = Number.isFinite(input.xPct) ? Number(input.xPct) : 0
    const yPct = Number.isFinite(input.yPct) ? Number(input.yPct) : 0
    const rs = await this.db.execute(
      `INSERT INTO preview_comments (section_id, section_label, text, x_pct, y_pct, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       RETURNING id, section_id, section_label, text, x_pct, y_pct, created_at`,
      [sectionId, sectionLabel, text, xPct, yPct],
    )
    return toPreviewComment(rs.rows[0] as unknown as Row)
  }

  async remove(id: number): Promise<{ ok: true }> {
    await this.db.execute(`DELETE FROM preview_comments WHERE id = ?`, [id])
    return { ok: true }
  }

  async clear(): Promise<{ ok: true }> {
    await this.db.execute(`DELETE FROM preview_comments`)
    return { ok: true }
  }
}
