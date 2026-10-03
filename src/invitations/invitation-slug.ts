/** URL segment for /i/:slug — lowercase, sin acentos, guiones. */
export function nameToInvitationSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'invitado'
}

/** 16-byte hex token from randomBytes(16).toString('hex') */
export function looksLikeInvitationToken(key: string): boolean {
  return /^[a-f0-9]{32}$/i.test(key.trim())
}
