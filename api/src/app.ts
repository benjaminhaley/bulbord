import cors from '@fastify/cors'
import Fastify from 'fastify'

import { eventsRoutes } from './events/routes.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean),
  })

  app.get('/health', async () => ({ ok: true }))

  await app.register(eventsRoutes)

  return app
}
