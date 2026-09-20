import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type Client, type ResultSet } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

function isRemoteLibsqlUrl(url: string): boolean {
  return /^libsql:\/\//i.test(url) || /^https:\/\//i.test(url)
}

function redactDbUrl(url: string): string {
  return url.replace(/authToken=[^&]+/i, 'authToken=***')
}

/**
 * libSQL: Turso remoto en prod (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`)
 * o SQLite local en dev (`file:./.data/casamiento.db`).
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name)
  private client: Client | null = null

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return this.client != null
  }

  onModuleInit(): void {
    const tursoUrl = this.config.get<string>('TURSO_DATABASE_URL')?.trim()
    const legacyUrl = this.config.get<string>('DATABASE_URL')?.trim()
    const url = tursoUrl || legacyUrl || 'file:./.data/casamiento.db'
    const authToken = this.config.get<string>('TURSO_AUTH_TOKEN')?.trim()

    if (isRemoteLibsqlUrl(url)) {
      if (!authToken) {
        throw new Error('TURSO_AUTH_TOKEN es requerido cuando TURSO_DATABASE_URL es remoto')
      }
      this.client = createClient({ url, authToken })
      this.logger.log(`Turso listo · ${redactDbUrl(url)}`)
      return
    }

    const withoutScheme = url.replace(/^file:(\/\/)?/i, '')
    const abs = isAbsolute(withoutScheme) ? withoutScheme : resolve(process.cwd(), withoutScheme)
    mkdirSync(dirname(abs), { recursive: true })
    const fileUrl = process.platform === 'win32' ? `file:///${abs.replace(/\\/g, '/')}` : `file:${abs}`
    this.client = createClient({ url: fileUrl })
    this.logger.log(`SQLite local · ${abs}`)
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.close()
    this.client = null
  }

  private requireClient(): Client {
    if (!this.client) throw new Error('DB no configurada')
    return this.client
  }

  async execute(sql: string, args: unknown[] = []): Promise<ResultSet> {
    return this.requireClient().execute({
      sql,
      args: args as Array<string | number | bigint | boolean | null>,
    })
  }

  async ensureColumn(table: string, column: string, ddlType: string): Promise<void> {
    const info = await this.execute(`PRAGMA table_info(${table})`)
    const exists = info.rows.some((row) => String((row as unknown as { name?: string }).name) === column)
    if (!exists) {
      await this.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`)
    }
  }
}
