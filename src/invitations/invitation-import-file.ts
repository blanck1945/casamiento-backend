import { BadRequestException } from '@nestjs/common'
import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'

export type ImportFileMeta = {
  originalname?: string
  mimetype?: string
}

export function isXlsxImport(meta: ImportFileMeta | undefined, buffer: Buffer): boolean {
  const name = meta?.originalname?.trim().toLowerCase() ?? ''
  if (name.endsWith('.xlsx')) return true
  if (name.endsWith('.xls')) return true
  if (name.endsWith('.csv') || name.endsWith('.txt')) return false

  const mime = meta?.mimetype?.trim().toLowerCase() ?? ''
  if (mime.includes('spreadsheetml') || mime.includes('officedocument.spreadsheet')) return true
  if (mime.includes('csv') || mime === 'text/plain') return false
  if (mime === 'application/vnd.ms-excel' && (name.endsWith('.xls') || name.endsWith('.xlsx'))) return true

  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function recordsFromXlsx(buffer: Buffer): Record<string, string>[] {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch {
    throw new BadRequestException('invalid Excel (.xlsx) format')
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new BadRequestException('Excel file has no sheets')

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  return raw.map((row) => {
    const record: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      record[String(key).trim()] = cellToString(value)
    }
    return record
  })
}

function recordsFromCsv(buffer: Buffer): Record<string, string>[] {
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  try {
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[]
  } catch {
    throw new BadRequestException('invalid CSV format')
  }
}

export function recordsFromImportFile(buffer: Buffer, meta?: ImportFileMeta): Record<string, string>[] {
  if (!buffer.length) throw new BadRequestException('file is empty')

  const records = isXlsxImport(meta, buffer) ? recordsFromXlsx(buffer) : recordsFromCsv(buffer)

  const nonEmpty = records.filter((row) =>
    Object.values(row).some((v) => String(v ?? '').trim() !== ''),
  )

  if (nonEmpty.length === 0) {
    throw new BadRequestException('file has no data rows')
  }

  return nonEmpty
}
