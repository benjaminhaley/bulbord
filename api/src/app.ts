import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'

import { adminRoutes } from './admin/routes.js'
import { analyticsRoutes } from './analytics/routes.js'
import { authPlugin } from './auth/plugin.js'
import { authRoutes } from './auth/routes.js'
import { campCommentsRoutes } from './camps/comments.js'
import { campsRoutes } from './camps/routes.js'
import { connectionsRoutes } from './connections/routes.js'
import { eventCommentsRoutes } from './events/comments.js'
import { emailIngestRoutes } from './events/email-ingest-routes.js'
import { eventsRoutes } from './events/routes.js'
import { feedbackCommentsRoutes } from './feedback/comments.js'
import { feedbackRoutes } from './feedback/routes.js'
import { newsletterRoutes } from './newsletter/routes.js'
import { notificationsRoutes } from './notifications/routes.js'
import { sportsClubCommentsRoutes } from './sports-clubs/comments.js'
import { sportsClubsRoutes } from './sports-clubs/routes.js'
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
  await app.register(analyticsRoutes)
  await app.register(eventsRoutes)
  await app.register(eventCommentsRoutes)
  await app.register(emailIngestRoutes)
  await app.register(campsRoutes)
  await app.register(campCommentsRoutes)
  await app.register(connectionsRoutes)
  await app.register(feedbackRoutes)
  await app.register(feedbackCommentsRoutes)
  await app.register(newsletterRoutes)
  await app.register(notificationsRoutes)
  await app.register(sportsClubsRoutes)
  await app.register(sportsClubCommentsRoutes)
  await app.register(uploadsRoutes)

  return app
}
