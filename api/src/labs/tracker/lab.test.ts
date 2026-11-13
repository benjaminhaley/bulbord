import { randomUUID } from 'node:crypto'

import Fastify, { type FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { tracker } from './lab.js'

// Runs the tracker's routes against a real Postgres (skipped where
// DATABASE_URL isn't set). The test stands in for the sandbox: the member is
// whoever the x-member header names, and the database login is the app's own
// (the sandbox's isolation is tested in sandbox.test.ts).
describe.skipIf(!process.env.DATABASE_URL)('tracker lab', () => {
  let app: FastifyInstance
  const admin = postgres(process.env.DATABASE_URL ?? '', { max: 1, onnotice: () => {} })
  const member = randomUUID()
  const other = randomUUID()

  beforeAll(async () => {
    await admin.unsafe('CREATE SCHEMA IF NOT EXISTS lab_tracker')
    app = Fastify()
    await app.register(async (scope) => {
      await tracker.plugin(scope, {
        memberId: (request) => (request.headers['x-member'] as string | undefined) ?? null,
        databaseUrl: async () => process.env.DATABASE_URL!,
        schema: 'lab_tracker',
      })
    }, { prefix: '/labs/tracker' })
  })

  afterAll(async () => {
    await admin.unsafe('DELETE FROM lab_tracker.tracker_entries WHERE user_id IN ($1, $2)', [member, other])
    await admin.unsafe('DELETE FROM lab_tracker.tracker_items WHERE user_id IN ($1, $2)', [member, other])
    await admin.end()
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, as = member) =>
    app.inject({ method, url: `/labs/tracker${url}`, payload, headers: { 'x-member': as } })

  it('answers 401 when signed out', async () => {
    expect((await app.inject({ url: '/labs/tracker/items' })).statusCode).toBe(401)
  })

  it('seeds plan-ahead goals; a new upcoming date replaces the next one', async () => {
    const goals = (await call('GET', '/items')).json().data
    const hang = goals.find((g: { name: string }) => g.name === 'Hang with a friend')
    expect(hang).toMatchObject({ type: 'plan', period_days: 7, description: '', entries: [] })

    const today = '2026-11-05'
    await call('POST', `/items/${hang.id}/entries`, { date: '2026-11-20', note: 'Book club', today })
    await call('POST', `/items/${hang.id}/entries`, { date: '2026-10-27', note: 'Jeb', today })
    await call('POST', `/items/${hang.id}/entries`, { date: '2026-11-08', note: 'Picnic', today })

    const after = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === hang.id)
    expect(after.entries.map((e: { date: string; note: string }) => [e.date, e.note])).toEqual([
      ['2026-11-08', 'Picnic'],
      ['2026-10-27', 'Jeb'],
    ])
    // Logging today leaves the future plan alone.
    await call('POST', `/items/${hang.id}/entries`, { date: today, note: 'Coffee', today })
    const logged = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === hang.id)
    expect(logged.entries.map((e: { note: string }) => e.note)).toEqual(['Picnic', 'Coffee', 'Jeb'])
    await call('POST', `/items/${hang.id}/entries`, { date: '2026-11-09', note: 'Park', today })
    const replaced = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === hang.id)
    expect(replaced.entries.map((e: { note: string }) => e.note)).toEqual(['Park', 'Coffee', 'Jeb'])

    // Tap-to-edit: a new note, then a move that takes over the future plan.
    const coffee = replaced.entries.find((e: { note: string }) => e.note === 'Coffee')
    expect((await call('PATCH', `/entries/${coffee.id}`, { note: 'Long coffee', today })).json()).toMatchObject({ date: today, note: 'Long coffee' })
    expect((await call('PATCH', `/entries/${coffee.id}`, { date: '2026-11-12', today })).json()).toMatchObject({ date: '2026-11-12', note: 'Long coffee' })
    const moved = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === hang.id)
    expect(moved.entries.map((e: { note: string }) => e.note)).toEqual(['Long coffee', 'Jeb'])
    expect((await call('PATCH', `/entries/${coffee.id}`, { note: 'Taken' }, other)).statusCode).toBe(404)

    expect((await call('PATCH', `/items/${hang.id}`, { period_days: 14, description: 'See good friends more' })).json()).toMatchObject({
      period_days: 14,
      description: 'See good friends more',
    })
    expect((await call('PATCH', `/items/${hang.id}`, { stale_days: 3 })).statusCode).toBe(400)
  })

  it('keeps progress entries to today or earlier', async () => {
    const goal = (await call('POST', '/items', { name: 'Garage shelves', type: 'progress' })).json()
    expect(goal).toMatchObject({ type: 'progress', stale_days: 14, period_days: null })
    expect((await call('POST', `/items/${goal.id}/entries`, { date: '2026-11-06', today: '2026-11-05' })).statusCode).toBe(400)
    const entry = await call('POST', `/items/${goal.id}/entries`, { date: '2026-11-05', note: 'Cut boards', today: '2026-11-05' })
    expect(entry.statusCode).toBe(201)
    expect((await call('PATCH', `/entries/${entry.json().id}`, { date: '2026-11-06', today: '2026-11-05' })).statusCode).toBe(400)
  })

  it('records a check-in goal kept or missed, one record per chosen day', async () => {
    const goal = (await call('POST', '/items', { name: 'No drinking', type: 'checkin', weekdays: [1, 0, 1] })).json()
    expect(goal.weekdays).toEqual([0, 1])
    const record = (date: string, outcome?: string) => call('POST', `/items/${goal.id}/entries`, { date, outcome, today: '2026-11-05' })

    expect((await record('2026-11-02', 'kept')).statusCode).toBe(201) // a Monday
    expect((await record('2026-11-02', 'missed')).statusCode).toBe(201)
    expect((await record('2026-11-04', 'kept')).statusCode).toBe(400) // a Wednesday
    expect((await record('2026-11-09', 'kept')).statusCode).toBe(400) // after today
    expect((await record('2026-11-03')).statusCode).toBe(400)

    const after = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === goal.id)
    expect(after.entries).toMatchObject([{ date: '2026-11-02', outcome: 'missed' }])
    expect((await call('PATCH', `/entries/${after.entries[0].id}`, { note: 'No' })).statusCode).toBe(400)
    expect((await call('POST', '/items', { name: 'No days', type: 'checkin', weekdays: [] })).statusCode).toBe(400)
  })

  it('records a weekly goal on any day, one record per day', async () => {
    const goal = (await call('POST', '/items', { name: 'Work on projects', type: 'weekly', days_per_week: 5 })).json()
    expect(goal).toMatchObject({ type: 'weekly', days_per_week: 5, weekdays: null })
    const record = (date: string, outcome?: string) => call('POST', `/items/${goal.id}/entries`, { date, outcome, today: '2026-11-09' })

    expect((await record('2026-11-07', 'kept')).statusCode).toBe(201) // a Saturday
    expect((await record('2026-11-08', 'kept')).statusCode).toBe(201) // a Sunday
    expect((await record('2026-11-08', 'missed')).statusCode).toBe(201)
    expect((await record('2026-11-10', 'kept')).statusCode).toBe(400) // after today
    expect((await record('2026-11-06')).statusCode).toBe(400)

    const after = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === goal.id)
    expect(after.entries).toMatchObject([{ date: '2026-11-08', outcome: 'missed' }, { date: '2026-11-07', outcome: 'kept' }])
    expect((await call('PATCH', `/entries/${after.entries[0].id}`, { note: 'No' })).statusCode).toBe(400)

    expect((await call('PATCH', `/items/${goal.id}`, { days_per_week: 3 })).json()).toMatchObject({ days_per_week: 3 })
    expect((await call('PATCH', `/items/${goal.id}`, { days_per_week: 8 })).statusCode).toBe(400)
    expect((await call('PATCH', `/items/${goal.id}`, { weekdays: [1] })).statusCode).toBe(400)
    expect((await call('POST', '/items', { name: 'Default', type: 'weekly' })).json()).toMatchObject({ days_per_week: 5 })
  })

  it('keeps every answer to an every-few-hours goal, with its time', async () => {
    const goal = (await call('POST', '/items', { name: 'Did I think to yes and?', type: 'often' })).json()
    expect(goal).toMatchObject({ type: 'often', every_hours: 6, times_per_week: 10 })
    const answer = (outcome?: string, date = '2026-11-09') => call('POST', `/items/${goal.id}/entries`, { date, outcome, today: '2026-11-09' })

    expect((await answer('kept')).statusCode).toBe(201)
    expect((await answer('kept')).statusCode).toBe(201)
    expect((await answer('missed')).statusCode).toBe(201)
    expect((await answer()).statusCode).toBe(400)
    expect((await answer('kept', '2026-11-10')).statusCode).toBe(400)

    const after = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === goal.id)
    expect(after.entries).toHaveLength(3)
    expect(Date.parse(after.entries[0].at)).toBeGreaterThan(0)
    expect((await call('PATCH', `/entries/${after.entries[0].id}`, { note: 'No' })).statusCode).toBe(400)

    expect((await call('PATCH', `/items/${goal.id}`, { every_hours: 4, times_per_week: 12 })).json()).toMatchObject({ every_hours: 4, times_per_week: 12 })
    expect((await call('PATCH', `/items/${goal.id}`, { every_hours: 0 })).statusCode).toBe(400)
    // Any goal can reword its question; '' goes back to the title.
    expect(goal.question).toBe('')
    expect((await call('PATCH', `/items/${goal.id}`, { question: '  Did I yes-and  ' })).json()).toMatchObject({ question: 'Did I yes-and' })
    expect((await call('PATCH', `/items/${goal.id}`, { question: 'x'.repeat(121) })).statusCode).toBe(400)
    // Any goal can stop asking for a note after Yes (on by default).
    expect(goal.ask_note).toBe(true)
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note: false })).json()).toMatchObject({ ask_note: false })
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note: 'no' })).statusCode).toBe(400)
  })

  it("hides one member's goals from another", async () => {
    const mine = (await call('POST', '/items', { name: 'Mine', type: 'progress' })).json()
    expect((await call('POST', `/items/${mine.id}/entries`, { date: '2026-10-01' }, other)).statusCode).toBe(404)
    expect((await call('PATCH', `/items/${mine.id}`, { name: 'Taken' }, other)).statusCode).toBe(404)
    expect((await call('DELETE', `/items/${mine.id}`, undefined, other)).statusCode).toBe(404)
    expect((await call('DELETE', `/items/${mine.id}`)).statusCode).toBe(200)
  })
})
