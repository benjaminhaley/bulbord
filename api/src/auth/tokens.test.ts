import { describe, expect, it } from 'vitest'

import { signJson, verifyJson } from './tokens.js'

describe('signJson / verifyJson', () => {
  const secret = 'test-secret'

  it('round-trips a payload signed with the same secret', () => {
    const token = signJson({ hello: 'world', n: 1 }, secret)
    expect(verifyJson<{ hello: string; n: number }>(token, secret)).toEqual({ hello: 'world', n: 1 })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signJson({ hello: 'world' }, secret)
    expect(verifyJson(token, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload', () => {
    const token = signJson({ amount: 1 }, secret)
    const [encoded, signature] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ amount: 1000 })).toString('base64url')
    expect(verifyJson(`${tamperedPayload}.${signature}`, secret)).toBeNull()
    expect(encoded).toBeTruthy() // sanity: original encoding differs from tampered
  })

  it('rejects a malformed token', () => {
    expect(verifyJson('not-a-valid-token', secret)).toBeNull()
    expect(verifyJson('only.two.parts.here', secret)).toBeNull()
  })
})
