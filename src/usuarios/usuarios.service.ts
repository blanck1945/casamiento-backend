import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { DbService } from '../db/db.service'

export type UsuarioAdmin = {
  id: number
  nombre: string
  email: string
}

type Row = {
  id: number
  nombre: string
  email: string
  password_hash: string
}

/**
 * Usuarios del dashboard admin. Simple: login por email/password (bcrypt),
 * sesión guardada en localStorage del front (sin JWT/SDK externo).
 * Siembra un usuario demo desde DEMO_DASHBOARD_EMAIL/PASSWORD.
 */
@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly log = new Logger(UsuariosService.name)

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
    await this.seedDemoUsuario()
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  private async seedDemoUsuario(): Promise<void> {
    const email = (this.config.get<string>('DEMO_DASHBOARD_EMAIL') || 'demo@casamiento.local').trim().toLowerCase()
    const password = this.config.get<string>('DEMO_DASHBOARD_PASSWORD') || 'demo123'
    const nombre = this.config.get<string>('DEMO_DASHBOARD_NOMBRE') || 'Admin Casamiento'

    const rs = await this.db.execute(`SELECT id FROM usuarios WHERE email = ?`, [email])
    if (rs.rows.length > 0) return

    const hash = await bcrypt.hash(password, 10)
    await this.db.execute(
      `INSERT INTO usuarios (nombre, email, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [nombre, email, hash],
    )
    this.log.log(`Usuario demo creado: ${email}`)
  }

  async login(email: string, password: string): Promise<UsuarioAdmin> {
    const normalized = (email || '').trim().toLowerCase()
    const rs = await this.db.execute(`SELECT id, nombre, email, password_hash FROM usuarios WHERE email = ?`, [normalized])
    const row = rs.rows[0] as unknown as Row | undefined
    if (!row) throw new UnauthorizedException('Email o contraseña incorrectos')

    const ok = await bcrypt.compare(password || '', row.password_hash)
    if (!ok) throw new UnauthorizedException('Email o contraseña incorrectos')

    return { id: Number(row.id), nombre: String(row.nombre), email: String(row.email) }
  }
}
