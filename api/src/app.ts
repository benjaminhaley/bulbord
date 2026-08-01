import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'

import { adminRoutes } from './admin/routes.js'
import { authPlugin } from './auth/plugin.js'
import { authRoutes } from './auth/routes.js'
import { eventsRoutes } from './events/routes.js'
import { feedbackRoutes } from './feedback/routes.js'
import { uploadsRoutes } from './uploads/routes.js'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } })

  app.get('/health', async () => ({ ok: true }))

  await app.register(authPlugin)
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(eventsRoutes)
  await app.register(feedbackRoutes)
  await app.register(uploadsRoutes)

  return app
}
