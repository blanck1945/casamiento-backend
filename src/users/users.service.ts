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
    await this.migrateLegacyAugustoAdminEmail()
    await this.seedNamedDashboardAdmins()
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

  /** Renombra el admin Augusto si quedó el email viejo en Turso/SQLite local. */
  private async migrateLegacyAugustoAdminEmail(): Promise<void> {
    const oldEmail = 'aspastra990@gmail.com'
    const newEmail = 'aspastrana990@gmail.com'
    const oldRs = await this.db.execute(`SELECT id FROM admin_users WHERE email = ?`, [oldEmail])
    if (oldRs.rows.length === 0) return

    const newRs = await this.db.execute(`SELECT id FROM admin_users WHERE email = ?`, [newEmail])
    if (newRs.rows.length > 0) {
      await this.db.execute(`DELETE FROM admin_users WHERE email = ?`, [oldEmail])
      this.log.log(`Legacy admin ${oldEmail} removed (${newEmail} already exists)`)
      return
    }

    await this.db.execute(`UPDATE admin_users SET email = ? WHERE email = ?`, [newEmail, oldEmail])
    this.log.log(`Admin email migrated: ${oldEmail} → ${newEmail}`)
  }

  /** Admins reales: contraseñas solo por env (Railway), nunca en el repo. */
  private async seedNamedDashboardAdmins(): Promise<void> {
    const admins = [
      {
        email: 'aspastrana990@gmail.com',
        name: 'Augusto',
        passwordEnv: 'DASHBOARD_ADMIN_AUGUSTO_PASSWORD',
      },
      {
        email: 'vanesanspano@gmail.com',
        name: 'Vanesa',
        passwordEnv: 'DASHBOARD_ADMIN_VANESA_PASSWORD',
      },
    ] as const

    for (const admin of admins) {
      const password = this.config.get<string>(admin.passwordEnv)?.trim()
      if (!password) {
        this.log.warn(`Admin ${admin.email} omitido: falta ${admin.passwordEnv}`)
        continue
      }
      await this.ensureAdminUser(admin.email, password, admin.name)
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
