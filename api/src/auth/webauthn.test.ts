import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState: { activeUserIds: string[] } = { activeUserIds: [] }

// Minimal chainable stand-in for db.select().from().where().limit() — the
// only shape resolveInvitation's inviter lookup needs. Returns a matching row
// only if the queried id is in the current test's activeUserIds fixture.
vi.mock('../db/client.js', () => {
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    limit: () =>
      Promise.resolve(mockState.activeUserIds.length > 0 ? [{ id: mockState.activeUserIds[0] }] : []),
  }
  return { db: builder }
})

const { resolveInvitation } = await import('./webauthn.js')

const baseEnv = {
  rpId: 'localhost',
  rpName: 'Nettelhorst',
  origins: ['http://localhost:5173'],
  rootInviteSecret: 'the-root-secret',
  sessionSecret: 'the-session-secret',
}

describe('resolveInvitation', () => {
  beforeEach(() => {
    mockState.activeUserIds = []
  })

  it('rejects when neither an inviter nor a root secret is given', async () => {
    const result = await resolveInvitation(baseEnv, {})
    expect(result).toEqual({ ok: false, message: 'An invitation is required to join Nettelhorst' })
  })

  it('accepts a valid, active inviter', async () => {
    mockState.activeUserIds = ['user-123']
    const result = await resolveInvitation(baseEnv, { inviterUserId: 'user-123' })
    expect(result).toEqual({ ok: true, inviterUserId: 'user-123' })
  })

  it('rejects an inviter id that does not resolve to an active user', async () => {
    mockState.activeUserIds = []
    const result = await resolveInvitation(baseEnv, { inviterUserId: 'someone-deleted-or-fake' })
    expect(result).toEqual({ ok: false, message: 'Invalid invite link' })
  })

  it('accepts the correct root secret with no inviter', async () => {
    const result = await resolveInvitation(baseEnv, { rootSecret: 'the-root-secret' })
    expect(result).toEqual({ ok: true, inviterUserId: null })
  })

  it('rejects an incorrect root secret', async () => {
    const result = await resolveInvitation(baseEnv, { rootSecret: 'guessed-wrong' })
    expect(result).toEqual({ ok: false, message: 'Invalid root invite secret' })
  })

  it('rejects a root secret when none is configured', async () => {
    const result = await resolveInvitation({ ...baseEnv, rootInviteSecret: null }, { rootSecret: 'anything' })
    expect(result).toEqual({ ok: false, message: 'Invalid root invite secret' })
  })

  it('prefers the root secret over an inviter id if both are somehow present', async () => {
    mockState.activeUserIds = ['user-123']
    const result = await resolveInvitation(baseEnv, { rootSecret: 'the-root-secret', inviterUserId: 'user-123' })
    expect(result).toEqual({ ok: true, inviterUserId: null })
  })
})
