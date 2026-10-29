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
    await admin.unsafe('UPDATE lab_tracker.tracker_items SET parent_id = NULL WHERE user_id IN ($1, $2)', [member, other])
    await admin.unsafe('DELETE FROM lab_tracker.tracker_items WHERE user_id IN ($1, $2)', [member, other])
    await admin.end()
    await app.close()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, as = member) =>
    app.inject({ method, url: `/labs/tracker${url}`, payload, headers: { 'x-member': as } })

  it('answers 401 when signed out', async () => {
    expect((await app.inject({ url: '/labs/tracker/items' })).statusCode).toBe(401)
  })

  it('keeps past and future entries on a next item, newest date first', async () => {
    const items = (await call('GET', '/items')).json().data
    const hang = items.find((i: { name: string }) => i.name === 'Hang with a friend')
    expect(hang).toMatchObject({ kind: 'next', entries: [], projects: [] })

    await call('POST', `/items/${hang.id}/entries`, { date: '2099-11-30', note: 'Book club' })
    const past = (await call('POST', `/items/${hang.id}/entries`, { date: '2020-10-27', note: 'Jeb' })).json()
    expect((await call('PATCH', `/entries/${past.id}`, { note: 'Hung with Jeb' })).json()).toMatchObject({ date: '2020-10-27', note: 'Hung with Jeb' })

    const after = (await call('GET', '/items')).json().data.find((i: { id: string }) => i.id === hang.id)
    expect(after.entries.map((e: { date: string; note: string }) => [e.date, e.note])).toEqual([
      ['2099-11-30', 'Book club'],
      ['2020-10-27', 'Hung with Jeb'],
    ])
  })

  it('makes a log of projects, each with its own entries', async () => {
    const log = (await call('POST', '/items', { name: 'Current projects', kind: 'log', stale_days: 10 })).json()
    expect(log).toMatchObject({ kind: 'log', stale_days: 10 })
    const project = (await call('POST', '/items', { name: 'Garage shelves', parent_id: log.id })).json()
    expect(project.kind).toBe('project')
    await call('POST', `/items/${project.id}/entries`, { date: '2026-10-20', note: 'Cut boards' })

    // Entries go on a project, not the log itself.
    expect((await call('POST', `/items/${log.id}/entries`, { date: '2026-10-20' })).statusCode).toBe(400)
    expect((await call('PATCH', `/items/${log.id}`, { stale_days: 21 })).json().stale_days).toBe(21)

    const data = (await call('GET', '/items')).json().data
    expect(data.find((i: { id: string }) => i.id === project.id)).toBeUndefined()
    expect(data.find((i: { id: string }) => i.id === log.id)).toMatchObject({
      stale_days: 21,
      projects: [{ name: 'Garage shelves', entries: [{ date: '2026-10-20', note: 'Cut boards' }] }],
    })

    await call('DELETE', `/items/${log.id}`)
    const remaining = (await call('GET', '/items')).json().data
    expect(remaining.find((i: { id: string }) => i.id === log.id)).toBeUndefined()
    expect((await call('POST', `/items/${project.id}/entries`, { date: '2026-10-21' })).statusCode).toBe(404)
  })

  it("hides one member's items from another", async () => {
    const mine = (await call('POST', '/items', { name: 'Mine', kind: 'log' })).json()
    expect(mine.stale_days).toBe(14)
    expect((await call('POST', '/items', { name: 'Sneaky', parent_id: mine.id }, other)).statusCode).toBe(404)
    expect((await call('PATCH', `/items/${mine.id}`, { name: 'Taken' }, other)).statusCode).toBe(404)
    expect((await call('DELETE', `/items/${mine.id}`, undefined, other)).statusCode).toBe(404)
  })
})
