import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors the db/client.js mocking pattern in newsletter/service.test.ts —
// no real Postgres needed, just enough of the query builder shape to record
// what impersonateUser tried to do. insert() is shared across both the
// sessions row (from createSession) and the events_log rows, distinguished
// in assertions by their own shape rather than by table.
const selectResults: Record<string, unknown>[] = []
const insertCalls: Record<string, unknown>[] = []

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults),
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return {
          returning: () =>
            Promise.resolve([{ id: 'session-1', userId: row.userId, expiresAt: row.expiresAt }]),
        }
      },
    }),
  })
  return { db: builder }
})

beforeEach(() => {
  vi.stubEnv('PUBLIC_WEB_URL', 'https://nettelhorst.bulbord.com')
  selectResults.length = 0
  insertCalls.length = 0
})

describe('buildSignInUrl', () => {
  it('appends the token as a signInToken query param', async () => {
    const { buildSignInUrl } = await import('./impersonation.js')
    expect(buildSignInUrl('https://nettelhorst.bulbord.com', 'abc123')).toBe(
      'https://nettelhorst.bulbord.com/?signInToken=abc123',
    )
  })
})

describe('impersonateUser', () => {
  it('returns null for an unknown or already-deleted target, without creating a session', async () => {
    const { impersonateUser } = await import('./impersonation.js')
    const result = await impersonateUser('missing-user', 'admin-1')
    expect(result).toBeNull()
    expect(insertCalls).toHaveLength(0)
  })

  it('creates a real, short-lived (~1hr) session and a distinct audit log entry from the admin', async () => {
    selectResults.push({ id: 'user-1', name: 'Anna Piepmeyer' })
    const before = Date.now()

    const { impersonateUser } = await import('./impersonation.js')
    const result = await impersonateUser('user-1', 'admin-1')

    expect(result?.url).toMatch(/^https:\/\/nettelhorst\.bulbord\.com\/\?signInToken=.+/)

    const sessionInsert = insertCalls.find((c) => 'tokenHash' in c)
    expect(sessionInsert).toEqual(expect.objectContaining({ userId: 'user-1' }))
    const ttlMs = (sessionInsert!.expiresAt as Date).getTime() - before
    expect(ttlMs).toBeGreaterThan(59 * 60 * 1000)
    expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)

    // The session's own "session_created" log (actor: the impersonated
    // user, from createSession itself) is a separate entry from this one —
    // this is the one that actually shows an admin generated the link.
    const auditEntry = insertCalls.find((c) => c.action === 'user_impersonated')
    expect(auditEntry).toEqual(
      expect.objectContaining({
        actor: 'admin-1',
        action: 'user_impersonated',
        metadata: expect.objectContaining({ targetUserId: 'user-1', targetName: 'Anna Piepmeyer' }),
      }),
    )
  })
})
