import { extname } from 'node:path'

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
/** Límite de Multer: el mayor de ambos tipos. */
export const MAX_UPLOAD_BYTES = Math.max(MAX_PHOTO_BYTES, MAX_VIDEO_BYTES)

export const ALLOWED_PHOTO_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
])

export const ALLOWED_MIME = new Set([...ALLOWED_PHOTO_MIME, ...ALLOWED_VIDEO_MIME])

const VIDEO_EXT = /\.(mp4|mov|webm|avi)$/i
const PHOTO_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i

export function isVideoMime(mimeType: string, originalName = ''): boolean {
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('video/')) return true
  if (mime && !mime.startsWith('image/')) return false
  return VIDEO_EXT.test(extname(originalName))
}

export function isPhotoMime(mimeType: string, originalName = ''): boolean {
  const mime = mimeType.toLowerCase()
  if (ALLOWED_PHOTO_MIME.has(mime)) return true
  if (mime.startsWith('video/')) return false
  return PHOTO_EXT.test(extname(originalName))
}

export function maxBytesForMime(mimeType: string, originalName = ''): number {
  return isVideoMime(mimeType, originalName) ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES
}

export function maxMbForMime(mimeType: string, originalName = ''): number {
  return Math.round(maxBytesForMime(mimeType, originalName) / (1024 * 1024))
}

export function mediaKindLabel(mimeType: string, originalName = ''): 'video' | 'foto' {
  return isVideoMime(mimeType, originalName) ? 'video' : 'foto'
}

export function isAllowedUpload(mimeType: string, originalName = ''): boolean {
  const mime = mimeType.toLowerCase()
  if (mime && ALLOWED_MIME.has(mime)) return true
  const ext = extname(originalName).toLowerCase()
  return VIDEO_EXT.test(ext) || PHOTO_EXT.test(ext)
}
