import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
import fs from 'node:fs'

const src = process.argv[2] || 'C:/Users/elabu/Desktop/invitados_boda (4).xlsx'
const outXlsx = process.argv[3] || 'C:/Users/elabu/Desktop/invitados-dashboard-import.xlsx'
const outCsv = process.argv[4] || 'C:/Users/elabu/Desktop/invitados-dashboard-import.csv'

const rows = XLSX.utils.sheet_to_json(XLSX.readFile(src).Sheets['Invitados'], {
  defval: '',
  header: 1,
})

const data = []
const skipped = []

function normSi(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return s === 'sí' || s === 'si' || s === 'yes' || s === '1' || s === 'true'
}

function mapLado(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if (s === 'novio' || s === 'augusto') return 'augusto'
  if (s === 'novia' || s === 'vanesa') return 'vanesa'
  if (s === 'patricia') return 'patricia'
  return null
}

for (let i = 12; i < rows.length; i++) {
  const r = rows[i]
  const first = String(r[1] ?? '').trim()
  const last = String(r[2] ?? '').trim()
  if (!first && !last) continue

  const nombre = [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  if (!nombre) continue

  const lado = mapLado(r[4])
  if (!lado) {
    skipped.push({ fila: i + 1, nombre, motivo: `lado inválido: ${r[4]}` })
    continue
  }

  const email = String(r[7] ?? '').trim()
  const invita = normSi(r[15]) ? 'si' : 'no'
  data.push({ nombre, email, lado, invita })
}

const header = ['nombre', 'email', 'lado', 'invita']
const ws = XLSX.utils.json_to_sheet(data, { header })
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Invitados')
XLSX.writeFile(wb, outXlsx)

function esc(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvLines = [header.join(',')]
for (const row of data) {
  csvLines.push([row.nombre, row.email, row.lado, row.invita].map(esc).join(','))
}
fs.writeFileSync(outCsv, `\uFEFF${csvLines.join('\n')}\n`, 'utf8')

console.log(`Exportados: ${data.length} invitados`)
console.log(`Omitidos: ${skipped.length}`)
if (skipped.length) console.log('Ejemplos omitidos:', skipped.slice(0, 5))
console.log('XLSX:', outXlsx)
console.log('CSV:', outCsv)
