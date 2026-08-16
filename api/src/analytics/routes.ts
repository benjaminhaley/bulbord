import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { isTrackableAction, trackAnalyticsEvent } from './service.js'

// One small generic endpoint for every "read/UI action" analytics needs to
// log (feedback #96), rather than a bespoke route per action — any
// authenticated member can call this (unlike /admin/analytics/summary,
// which reads it back), since it's the member's own activity being
// recorded. `action` is checked against a fixed allowlist server-side so a
// client can't log arbitrary events_log rows.
export async function analyticsRoutes(app: FastifyInstance) {
  app.post('/analytics/track', { preHandler: requireAuth }, async (request, reply) => {
    const { action, metadata } = (request.body ?? {}) as { action?: string; metadata?: Record<string, unknown> }
    if (!action || !isTrackableAction(action)) {
      return reply.code(400).send({ error: { message: 'Unknown or missing action' } })
    }
    await trackAnalyticsEvent(request.currentUser!.id, action, metadata)
    return reply.send({ data: { tracked: true } })
  })
}
