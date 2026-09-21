import type { FastifyInstance } from 'fastify'

import { anonymousActor, isTrackableAction, trackAnalyticsEvent } from './service.js'

// One small generic endpoint for every "read/UI action" analytics needs to
// log (feedback #96), rather than a bespoke route per action. Public since
// feedback #175 (browsing no longer requires an account, and "anonymous
// visitors are included in analytics too"): an approved member is recorded
// under their user id, anyone else under `anon:<visitor_id>` — a random id
// the browser generated and keeps in localStorage (web/src/analytics/
// visitor.ts), which carries no personal information. `action` is checked
// against a fixed allowlist server-side so a client can't log arbitrary
// events_log rows, and metadata is size-capped since this is now open to
// the internet.
const MAX_METADATA_BYTES = 1024

export async function analyticsRoutes(app: FastifyInstance) {
  app.post('/analytics/track', async (request, reply) => {
    const { action, metadata, visitor_id } = (request.body ?? {}) as {
      action?: string
      metadata?: Record<string, unknown>
      visitor_id?: string
    }
    if (!action || !isTrackableAction(action)) {
      return reply.code(400).send({ error: { message: 'Unknown or missing action' } })
    }
    const actor = request.currentUser?.id ?? (visitor_id ? anonymousActor(visitor_id) : null)
    if (!actor) {
      return reply.code(400).send({ error: { message: 'visitor_id is required when not signed in' } })
    }
    const safeMetadata = metadata && JSON.stringify(metadata).length <= MAX_METADATA_BYTES ? metadata : undefined
    await trackAnalyticsEvent(actor, action, safeMetadata)
    return reply.send({ data: { tracked: true } })
  })
}
