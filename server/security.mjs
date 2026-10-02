import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function createSealer(secret, audience, now = Date.now) {
  const key = Buffer.from(secret || '', 'base64')
  if (key.length !== 32) throw Error('SESSION_KEY must be a base64 encoded 32-byte key')
  return {
    seal(purpose, value, lifetime) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(audience + ':' + purpose))
      const body = Buffer.concat([cipher.update(JSON.stringify({ value, expires: now() + lifetime })), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
    },
    open(purpose, token) {
      try {
        const data = Buffer.from(token || '', 'base64url')
        const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
        decipher.setAAD(Buffer.from(audience + ':' + purpose)); decipher.setAuthTag(data.subarray(12, 28))
        const parsed = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString())
        if (parsed.expires <= now()) return null
        return parsed.value
      } catch { return null }
    }
  }
}
export const nonce = () => randomBytes(32).toString('base64url')
export const challenge = value => createHash('sha256').update(value).digest('base64url')
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
export function desktopTarget(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1024 || url.pathname !== '/callback' || url.username || url.password || url.search || url.hash) return null
    return url.href
  } catch { return null }
}
export function driveTarget(path, method) {
  const url = new URL(path, 'https://www.googleapis.com')
  if (url.origin !== 'https://www.googleapis.com') return null
  if (method === 'POST' && url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') return url.href
  if (method !== 'GET') return null
  if (url.pathname === '/drive/v3/files/generateIds' && url.searchParams.get('space') === 'appDataFolder') return url.href
  if (url.pathname === '/drive/v3/files' && url.searchParams.get('spaces') === 'appDataFolder') return url.href
  if (/^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname) && url.searchParams.get('alt') === 'media') return url.href
  return null
}
