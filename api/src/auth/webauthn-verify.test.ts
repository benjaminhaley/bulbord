import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signJson } from './tokens.js'

// Each insert() call is recorded in order rather than keyed by table name —
// introspecting a Drizzle pgTable object's internal name isn't part of its
// public API, but verifyRegistration's call order (users, then
// passkeyCredentials, then eventsLog) is stable and part of what we're
// actually testing.
const insertCalls: (Record<string, unknown> | Record<string, unknown>[])[] = []
const updated: { credentialId?: string; counter?: number } = {}

vi.mock('@simplewebauthn/server', () => ({
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

vi.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: {
    fromBuffer: (buf: Uint8Array) => Buffer.from(buf).toString('base64url'),
    toBuffer: (s: string) => new Uint8Array(Buffer.from(s, 'base64url')),
  },
}))

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    insert: () => ({
      values: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        insertCalls.push(row)
        const rows = Array.isArray(row) ? row : [row]
        return {
          returning: () => Promise.resolve(rows.map((r) => ({ id: 'generated-id', ...r }))),
        }
      },
    }),
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve([storedCredentialRow]),
    update: () => ({
      set: (values: { counter?: number }) => ({
        where: () => {
          updated.counter = values.counter
          return Promise.resolve()
        },
      }),
    }),
  })
  return { db: builder }
})

let storedCredentialRow: {
  credential: { id: string; credentialId: string; publicKey: string; counter: number }
  user: { id: string; name: string }
}

beforeEach(() => {
  vi.stubEnv('WEBAUTHN_RP_ID', 'localhost')
  vi.stubEnv('WEBAUTHN_RP_NAME', 'Nettelhorst')
  vi.stubEnv('WEBAUTHN_ORIGIN', 'http://localhost:5173')
  vi.stubEnv('SESSION_SECRET', 'the-session-secret')
  insertCalls.length = 0
})

describe('verifyRegistration', () => {
  it('rejects an expired challenge token before ever calling verifyRegistrationResponse', async () => {
    const { verifyRegistration } = await import('./webauthn.js')
    const staleToken = signJson(
      { kind: 'register', challenge: 'abc', newUserId: 'u1', inviterUserId: null, issuedAt: Date.now() - 10 * 60 * 1000 },
      'the-session-secret',
    )
    const result = await verifyRegistration({ response: {} as never, challengeToken: staleToken })
    expect(result).toEqual({ ok: false, message: 'This registration attempt expired. Please try again.' })
  })

  it('creates a user and passkey credential once verification succeeds', async () => {
    const { verifyRegistrationResponse } = await import('@simplewebauthn/server')
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    } as never)

    const { verifyRegistration } = await import('./webauthn.js')
    const token = signJson(
      { kind: 'register', challenge: 'abc', newUserId: 'new-user-id', inviterUserId: 'inviter-id', issuedAt: Date.now() },
      'the-session-secret',
    )
    const result = await verifyRegistration({
      response: { response: {} } as never,
      challengeToken: token,
    })

    expect(result.ok).toBe(true)
    // Call order: users insert, then passkeyCredentials insert, then the
    // events_log batch insert (see verifyRegistration in webauthn.ts).
    expect(insertCalls[0]).toEqual(expect.objectContaining({ id: 'new-user-id', invitedByUserId: 'inviter-id' }))
    expect(insertCalls[1]).toEqual(expect.objectContaining({ credentialId: 'cred-1' }))
  })
})

describe('verifyAuthentication', () => {
  it('rejects an expired challenge token before ever looking up the credential', async () => {
    const { verifyAuthentication } = await import('./webauthn.js')
    const staleToken = signJson({ kind: 'login', challenge: 'abc', issuedAt: Date.now() - 10 * 60 * 1000 }, 'the-session-secret')
    const result = await verifyAuthentication({ response: { id: 'cred-1' } as never, challengeToken: staleToken })
    expect(result).toEqual({ ok: false, message: 'This sign-in attempt expired. Please try again.' })
  })

  it('updates the stored counter after a verified sign-in', async () => {
    storedCredentialRow = {
      credential: { id: 'row-id', credentialId: 'cred-1', publicKey: Buffer.from([1, 2, 3]).toString('base64url'), counter: 5 },
      user: { id: 'existing-user-id', name: 'Alex Rivera' },
    }

    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    } as never)

    const { verifyAuthentication } = await import('./webauthn.js')
    const token = signJson({ kind: 'login', challenge: 'abc', issuedAt: Date.now() }, 'the-session-secret')
    const result = await verifyAuthentication({ response: { id: 'cred-1' } as never, challengeToken: token })

    expect(result.ok).toBe(true)
    expect(updated.counter).toBe(6)
  })
})
