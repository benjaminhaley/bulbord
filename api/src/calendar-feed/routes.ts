import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { feedUrl, renderFeedForToken } from './service.js'

export async function calendarFeedRoutes(app: FastifyInstance) {
  // The member's own subscription URL, for the Account page's "Sync to
  // calendar" screen.
  app.get('/calendar/feed-url', { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ data: { url: feedUrl(request.currentUser!.id) } })
  })

  // Public by design (token-in-URL) — calendar apps poll it with no headers.
  app.get('/calendar/feed/:file', async (request, reply) => {
    const { file } = request.params as { file: string }
    const ics = await renderFeedForToken(file.replace(/\.ics$/, ''))
    if (!ics) return reply.code(404).send({ error: { message: 'Calendar feed not found' } })
    return reply.type('text/calendar; charset=utf-8').header('Cache-Control', 'private, max-age=900').send(ics)
  })
}
