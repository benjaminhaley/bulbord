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

// Fixed-length hash comparison so neither timing nor length leaks anything
// about the secret, regardless of the length of the value being checked.
export function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)))
}

// Signed, timestamped nonce used as the OAuth `state` param — CSRF protection
// for the login handshake without needing a server-side session before login exists.
export function createState(secret: string): string {
  const nonce = randomToken(16)
  const timestamp = Date.now().toString()
  const payload = `${nonce}.${timestamp}`
  return `${payload}.${sign(payload, secret)}`
}

export function verifyState(state: string, secret: string, maxAgeMs = 10 * 60 * 1000): boolean {
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, timestamp, signature] = parts
  const payload = `${nonce}.${timestamp}`
  const expected = sign(payload, secret)

  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return false
  }

  const age = Date.now() - Number(timestamp)
  return age >= 0 && age <= maxAgeMs
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
  const expected = sign(encoded, secret)

  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
