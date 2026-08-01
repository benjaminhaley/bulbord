import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

// Fixed-length comparison so neither timing nor length leaks anything about
// which of two values (secrets, or a value against its expected signature).
function bytesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export function secretsMatch(a: string, b: string): boolean {
  return bytesEqual(hashToken(a), hashToken(b))
}

// Generic signed-JSON envelope — used for the WebAuthn ceremony's challenge
// token, which needs to carry a small payload (the challenge plus whatever
// was already validated when options were generated, e.g. an invite) between
// the options and verify calls without server-side storage in between.
export function signJson(payload: unknown, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function verifyJson<T>(token: string, secret: string): T | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, signature] = parts
  if (!bytesEqual(sign(encoded, secret), signature)) return null

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
