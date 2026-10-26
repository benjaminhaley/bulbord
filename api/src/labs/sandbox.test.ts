import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { registerLabs } from './sandbox.js'

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
