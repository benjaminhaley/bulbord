import cors from '@fastify/cors'
import Fastify from 'fastify'

import { authPlugin } from './auth/plugin.js'
import { authRoutes } from './auth/routes.js'
import { eventsRoutes } from './events/routes.js'
import { feedbackRoutes } from './feedback/routes.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean),
  })

  app.get('/health', async () => ({ ok: true }))

  await app.register(authPlugin)
  await app.register(authRoutes)
  await app.register(eventsRoutes)
  await app.register(feedbackRoutes)

  return app
}
