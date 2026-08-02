import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mirrors the db/client.js mocking pattern in auth/webauthn-verify.test.ts —
// no real Postgres needed, just enough of the query builder shape to record
// what unsubscribeFromNewsletter tried to do.
const updateCalls: { values: Record<string, unknown>; where: unknown }[] = []
const insertCalls: Record<string, unknown>[] = []

vi.mock('../db/client.js', () => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (whereClause: unknown) => {
          updateCalls.push({ values, where: whereClause })
          return Promise.resolve()
        },
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertCalls.push(row)
        return Promise.resolve()
      },
    }),
  })
  return { db: builder }
})

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'the-session-secret')
  updateCalls.length = 0
  insertCalls.length = 0
})

describe('unsubscribeFromNewsletter', () => {
  it('flips newsletter_subscribed and logs the action for a validly signed token', async () => {
    const { createUnsubscribeToken, unsubscribeFromNewsletter } = await import('./service.js')
    const token = createUnsubscribeToken('user-42')

    const result = await unsubscribeFromNewsletter(token)

    expect(result).toBe('ok')
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].values).toEqual(expect.objectContaining({ newsletterSubscribed: false }))
    expect(insertCalls[0]).toEqual(expect.objectContaining({ actor: 'user-42', action: 'newsletter_unsubscribed' }))
  })

  it('rejects a missing token without touching the database', async () => {
    const { unsubscribeFromNewsletter } = await import('./service.js')
    const result = await unsubscribeFromNewsletter(undefined)
    expect(result).toBe('invalid')
    expect(updateCalls).toHaveLength(0)
  })

  it('rejects a token signed with a different secret', async () => {
    const { createUnsubscribeToken, unsubscribeFromNewsletter } = await import('./service.js')
    const token = createUnsubscribeToken('user-42')
    vi.stubEnv('SESSION_SECRET', 'a-different-secret')

    const result = await unsubscribeFromNewsletter(token)

    expect(result).toBe('invalid')
    expect(updateCalls).toHaveLength(0)
  })

  it('rejects a tampered/garbage token', async () => {
    const { unsubscribeFromNewsletter } = await import('./service.js')
    const result = await unsubscribeFromNewsletter('not-a-real-token')
    expect(result).toBe('invalid')
    expect(updateCalls).toHaveLength(0)
  })
})
