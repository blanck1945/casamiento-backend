import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { DbService } from '../db/db.service'

export type AdminUser = {
  id: number
  name: string
  email: string
}

type Row = {
  id: number
  name: string
  email: string
  password_hash: string
}

/** Dashboard admin users: email/password login (bcrypt), session stored in the frontend. */
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly log = new Logger(UsersService.name)

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.db.configured) return
    await this.ensureSchema()
    await this.seedDemoUser()
  }

  async ensureSchema(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  private async seedDemoUser(): Promise<void> {
    const password = this.config.get<string>('DEMO_DASHBOARD_PASSWORD') || 'VanesaAugusto-Panel26'
    const name = this.config.get<string>('DEMO_DASHBOARD_NAME') || 'Administrador'
    const customEmail = this.config.get<string>('DEMO_DASHBOARD_EMAIL')?.trim().toLowerCase()

    await this.ensureAdminUser('panel@casamiento.local', password, name)

    if (customEmail && customEmail !== 'panel@casamiento.local') {
      await this.ensureAdminUser(customEmail, password, name)
    }
  }

  private async ensureAdminUser(email: string, password: string, name: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10)
    const rs = await this.db.execute(`SELECT id FROM admin_users WHERE email = ?`, [email])

    if (rs.rows.length > 0) {
      await this.db.execute(`UPDATE admin_users SET name = ?, password_hash = ? WHERE email = ?`, [
        name,
        hash,
        email,
      ])
      this.log.log(`Dashboard admin user synced: ${email}`)
      return
    }

    await this.db.execute(
      `INSERT INTO admin_users (name, email, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [name, email, hash],
    )
    this.log.log(`Dashboard admin user seeded: ${email}`)
  }

  async login(email: string, password: string): Promise<AdminUser> {
    const normalized = (email || '').trim().toLowerCase()
    const rs = await this.db.execute(`SELECT id, name, email, password_hash FROM admin_users WHERE email = ?`, [normalized])
    const row = rs.rows[0] as unknown as Row | undefined
    if (!row) throw new UnauthorizedException('Invalid email or password')

    const ok = await bcrypt.compare(password || '', row.password_hash)
    if (!ok) throw new UnauthorizedException('Invalid email or password')

    return { id: Number(row.id), name: String(row.name), email: String(row.email) }
  }
}
