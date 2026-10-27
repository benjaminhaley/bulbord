import Fastify from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { labSchema, provisionLabDatabase, registerLabs } from './sandbox.js'

describe('registerLabs', () => {
  it('mounts each lab under /labs/<name>', async () => {
    const app = Fastify()
    await registerLabs(app, [{ name: 'demo', plugin: async (scope) => { scope.get('/ping', async () => ({ ok: true })) } }])
    const res = await app.inject({ url: '/labs/demo/ping' })
    expect(res.json()).toEqual({ ok: true })
  })

  it('keeps the rest of the app booting when a lab throws while loading', async () => {
    const app = Fastify({ logger: false })
    app.get('/health', async () => ({ ok: true }))
    await registerLabs(app, [
      { name: 'broken', plugin: async () => { throw new Error('boom') } },
      { name: 'fine', plugin: async (scope) => { scope.get('/ping', async () => ({ ok: true })) } },
    ])
    await app.ready()
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200)
    expect((await app.inject({ url: '/labs/fine/ping' })).statusCode).toBe(200)
    expect((await app.inject({ url: '/labs/broken/anything' })).statusCode).toBe(404)
  })

  it("doesn't let a lab's hooks reach routes outside it", async () => {
    const app = Fastify()
    app.get('/health', async () => ({ ok: true }))
    await registerLabs(app, [{ name: 'hooky', plugin: async (scope) => {
      scope.addHook('onRequest', async (_req, reply) => { await reply.code(500).send({ error: 'lab hook' }) })
    } }])
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200)
  })
})

// The database half of the wall: a lab's own login can use its own schema and
// nothing else — not the app's tables, not another lab's.
// Needs a real Postgres (CI's api job has one); skipped where DATABASE_URL
// isn't set.
describe.skipIf(!process.env.DATABASE_URL)('provisionLabDatabase', () => {
  const names = ['isolation-a', 'isolation-b']
  const admin = postgres(process.env.DATABASE_URL ?? '', { max: 1, onnotice: () => {} })
  process.env.SESSION_SECRET ??= 'test-session-secret'

  beforeAll(async () => {
    // Stands in for an app table, so this works on an unmigrated database.
    await admin.unsafe('CREATE TABLE IF NOT EXISTS public.lab_isolation_app (x int)')
  })

  afterAll(async () => {
    await admin.unsafe('DROP TABLE IF EXISTS public.lab_isolation_app')
    for (const name of names) {
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${labSchema(name)} CASCADE`)
      await admin.unsafe(`DROP ROLE IF EXISTS ${labSchema(name)}`)
    }
    await admin.end()
  })

  it("gives a lab its own schema and no access to the app's or another lab's tables", async () => {
    const [a, b] = await Promise.all(names.map((name) => provisionLabDatabase(name)))
    // Running it again (every boot does) is harmless.
    expect(await provisionLabDatabase(names[0])).toBe(a)

    const labB = postgres(b, { max: 1, onnotice: () => {} })
    await labB.unsafe('CREATE TABLE lab_isolation_b.secrets (x int)')
    await labB.end()

    const labA = postgres(a, { max: 1, onnotice: () => {} })
    try {
      await labA.unsafe('CREATE TABLE lab_isolation_a.things (x int); INSERT INTO lab_isolation_a.things VALUES (1)')
      expect(await labA.unsafe('SELECT count(*)::int AS n FROM lab_isolation_a.things')).toEqual([{ n: 1 }])

      await expect(labA.unsafe('SELECT * FROM public.lab_isolation_app')).rejects.toThrow(/permission denied/)
      await expect(labA.unsafe('INSERT INTO public.lab_isolation_app VALUES (1)')).rejects.toThrow(/permission denied/)
      await expect(labA.unsafe('CREATE TABLE public.lab_was_here (x int)')).rejects.toThrow(/permission denied/)
      await expect(labA.unsafe('SELECT * FROM lab_isolation_b.secrets')).rejects.toThrow(/permission denied/)
    } finally {
      await labA.end()
    }
  })
})
