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

const sendNewsletterEmailMock = vi.fn(async (_to: string, _subject: string, _html: string) => {})
vi.mock('./mailer.js', () => ({
  sendNewsletterEmail: (to: string, subject: string, html: string) => sendNewsletterEmailMock(to, subject, html),
}))

const getWeeklyEventsMock = vi.fn(async (_fromDate: string, _toDate: string) => [
  {
    id: 'event-1',
    title: 'Story Time',
    description: 'A cozy weekly story time.',
    startDate: '2026-08-03',
    startTime: '10:00:00',
    allDay: false,
    address: null,
    locationName: 'Merlo Library',
    thumbnailUrl: null,
    interestedCount: 0,
    interestedNames: [],
  },
])
vi.mock('./query.js', () => ({
  getWeeklyEvents: (fromDate: string, toDate: string) => getWeeklyEventsMock(fromDate, toDate),
}))

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'the-session-secret')
  vi.stubEnv('PUBLIC_API_URL', 'https://api-production-a551.up.railway.app')
  vi.stubEnv('PUBLIC_WEB_URL', 'https://nettelhorst.bulbord.com')
  updateCalls.length = 0
  insertCalls.length = 0
  sendNewsletterEmailMock.mockClear()
  getWeeklyEventsMock.mockClear()
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

describe('sendTestNewsletterEmail', () => {
  it('sends this week\'s real newsletter render to just the given recipient, subject marked as a test', async () => {
    const { sendTestNewsletterEmail } = await import('./service.js')

    await sendTestNewsletterEmail({ id: 'admin-1', name: 'Ben Haley', email: 'ben@example.com' })

    expect(getWeeklyEventsMock).toHaveBeenCalledTimes(1)
    expect(sendNewsletterEmailMock).toHaveBeenCalledTimes(1)
    const [to, subject, html] = sendNewsletterEmailMock.mock.calls[0]
    expect(to).toBe('ben@example.com')
    expect(subject).toBe('[Test] This week near Nettelhorst: 1 event')
    expect(html).toContain('Story Time')
    expect(html).toContain('/newsletter/unsubscribe?token=')
  })
})
