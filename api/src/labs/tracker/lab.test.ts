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
    expect(hang).toMatchObject({ type: 'plan', target_count: 1, target_period_days: 7, description: '', entries: [] })
    expect(Date.parse(hang.created_at)).toBeGreaterThan(0)

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

    expect((await call('PATCH', `/items/${hang.id}`, { target_period_days: 14, description: 'See good friends more' })).json()).toMatchObject({
      target_count: 1,
      target_period_days: 14,
      description: 'See good friends more',
    })
    expect((await call('PATCH', `/items/${hang.id}`, { stale_days: 3 })).statusCode).toBe(400)
    // Any goal takes any target.
    expect((await call('PATCH', `/items/${hang.id}`, { target_count: 3 })).json()).toMatchObject({ target_count: 3, target_period_days: 14 })
    expect((await call('PATCH', `/items/${hang.id}`, { target_period_days: 10 })).statusCode).toBe(400)
    // Twice a year.
    expect((await call('PATCH', `/items/${hang.id}`, { target_count: 2, target_period_days: 365 })).json()).toMatchObject({ target_count: 2, target_period_days: 365 })
    expect((await call('PATCH', `/items/${hang.id}`, { target_count: 0 })).statusCode).toBe(400)
  })

  it('keeps progress entries to today or earlier', async () => {
    const goal = (await call('POST', '/items', { name: 'Garage shelves', type: 'progress' })).json()
    expect(goal).toMatchObject({ type: 'progress', stale_days: 14, target_count: 1, target_period_days: 7 })
    expect((await call('POST', `/items/${goal.id}/entries`, { date: '2026-11-06', today: '2026-11-05' })).statusCode).toBe(400)
    const entry = await call('POST', `/items/${goal.id}/entries`, { date: '2026-11-05', note: 'Cut boards', today: '2026-11-05' })
    expect(entry.statusCode).toBe(201)
    expect((await call('PATCH', `/entries/${entry.json().id}`, { date: '2026-11-06', today: '2026-11-05' })).statusCode).toBe(400)
  })

  it('records a check-in goal kept or missed, one record per chosen day', async () => {
    const goal = (await call('POST', '/items', { name: 'No drinking', type: 'checkin', weekdays: [1, 0, 1] })).json()
    expect(goal).toMatchObject({ weekdays: [0, 1], target_count: 2 }) // every chosen day
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

  it('fits a check-in goal to its days: some days a week is every day with a smaller goal', async () => {
    const goal = (await call('POST', '/items', { name: 'Work on projects', type: 'checkin', weekdays: [0, 1, 2, 3, 4, 5, 6], target_count: 5 })).json()
    expect(goal).toMatchObject({ target_count: 5, target_period_days: 7 })
    const record = (date: string, outcome?: string) => call('POST', `/items/${goal.id}/entries`, { date, outcome, today: '2026-11-09' })
    expect((await record('2026-11-07', 'kept')).statusCode).toBe(201) // any day
    expect((await record('2026-11-10', 'kept')).statusCode).toBe(400) // after today

    // No more days than it asks about: fewer days lower the goal to fit.
    expect((await call('PATCH', `/items/${goal.id}`, { weekdays: [1, 3] })).json()).toMatchObject({ weekdays: [1, 3], target_count: 2 })
    expect((await call('PATCH', `/items/${goal.id}`, { target_period_days: 14, target_count: 4 })).json()).toMatchObject({ target_count: 4 })
    expect((await call('PATCH', `/items/${goal.id}`, { target_count: 9 })).json()).toMatchObject({ target_count: 4 })
    // Aiming for every day keeps doing so when the days change.
    expect((await call('PATCH', `/items/${goal.id}`, { weekdays: [1, 3, 5] })).json()).toMatchObject({ target_count: 6 })
    // A year of two days a week is at most 104 (whole days).
    expect((await call('PATCH', `/items/${goal.id}`, { weekdays: [1, 3], target_period_days: 365, target_count: 200 })).json()).toMatchObject({ target_count: 104 })
  })

  it('keeps every answer to an every-few-hours goal, with its time', async () => {
    const goal = (await call('POST', '/items', { name: 'Did I think to yes and?', type: 'often' })).json()
    expect(goal).toMatchObject({ type: 'often', every_hours: 6, target_count: 10, target_period_days: 7 })
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

    expect((await call('PATCH', `/items/${goal.id}`, { every_hours: 4, target_count: 12 })).json()).toMatchObject({ every_hours: 4, target_count: 12 })
    expect((await call('PATCH', `/items/${goal.id}`, { every_hours: 0 })).statusCode).toBe(400)
    // Any goal can reword its question; '' goes back to the title.
    expect(goal.question).toBe('')
    expect((await call('PATCH', `/items/${goal.id}`, { question: '  Did I yes-and  ' })).json()).toMatchObject({ question: 'Did I yes-and' })
    expect((await call('PATCH', `/items/${goal.id}`, { question: 'x'.repeat(121) })).statusCode).toBe(400)
    // Any goal can stop asking for a note after Yes (on by default).
    expect(goal.ask_note).toBe(true)
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note: false })).json()).toMatchObject({ ask_note: false })
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note: 'no' })).statusCode).toBe(400)
    // ...and start asking after No (off by default).
    expect(goal.ask_note_no).toBe(false)
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note_no: true })).json()).toMatchObject({ ask_note: false, ask_note_no: true })
    expect((await call('PATCH', `/items/${goal.id}`, { ask_note_no: 1 })).statusCode).toBe(400)
  })

  it('changes a goal\'s type, carrying its entries over', async () => {
    const goal = (await call('POST', '/items', { name: 'Switch', type: 'progress', stale_days: 3 })).json()
    await call('POST', `/items/${goal.id}/entries`, { date: '2026-10-01', today: '2026-10-05' })
    // To a type with answers: its own setting is given, the old one cleared, the goal kept (fitted to the days), a logged date is a Yes.
    const daily = (await call('PATCH', `/items/${goal.id}`, { type: 'checkin', weekdays: [0, 1, 2, 3, 4, 5, 6] })).json()
    expect(daily).toMatchObject({ type: 'checkin', stale_days: null, target_count: 1 })
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'often' })).statusCode).toBe(200)
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'checkin', weekdays: [0, 1, 2, 3, 4, 5, 6] })).statusCode).toBe(200)
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'weekly' })).statusCode).toBe(400)
    await call('POST', `/items/${goal.id}/entries`, { date: '2026-10-02', outcome: 'missed', today: '2026-10-05' })
    const read = async () => (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === goal.id)
    expect((await read()).entries.map((e: { outcome: string }) => e.outcome)).toEqual(['missed', 'kept'])
    // Back to plan, with its own setting: a No is dropped, a Yes is a plain date.
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'plan', target_period_days: 14 })).json()).toMatchObject({ type: 'plan', target_period_days: 14, weekdays: null })
    expect((await read()).entries).toMatchObject([{ date: '2026-10-01', outcome: null }])
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'nope' })).statusCode).toBe(400)
    expect((await call('PATCH', `/items/${goal.id}`, { stale_days: 4 })).statusCode).toBe(400)
  })

  it('drops the upcoming plan when a plan goal changes type', async () => {
    const goal = (await call('POST', '/items', { name: 'Friends', type: 'plan' })).json()
    await call('POST', `/items/${goal.id}/entries`, { date: '2026-10-01', today: '2026-10-05' })
    await call('POST', `/items/${goal.id}/entries`, { date: '2026-10-20', today: '2026-10-05' })
    expect((await call('PATCH', `/items/${goal.id}`, { type: 'often', every_hours: 168, today: '2026-10-05' })).statusCode).toBe(200)
    const read = (await call('GET', '/items')).json().data.find((g: { id: string }) => g.id === goal.id)
    expect(read.entries).toMatchObject([{ date: '2026-10-01', outcome: 'kept' }])
  })

  it("hides one member's goals from another", async () => {
    const mine = (await call('POST', '/items', { name: 'Mine', type: 'progress' })).json()
    expect((await call('POST', `/items/${mine.id}/entries`, { date: '2026-10-01' }, other)).statusCode).toBe(404)
    expect((await call('PATCH', `/items/${mine.id}`, { name: 'Taken' }, other)).statusCode).toBe(404)
    expect((await call('DELETE', `/items/${mine.id}`, undefined, other)).statusCode).toBe(404)
    expect((await call('DELETE', `/items/${mine.id}`)).statusCode).toBe(200)
  })
})
