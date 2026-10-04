/** Hora civil Argentina (America/Argentina/Buenos_Aires), formato SQLite `YYYY-MM-DD HH:MM:SS`. */
export function nowArgentinaDateTime(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}
