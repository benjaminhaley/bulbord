import type { FastifyInstance } from 'fastify'

import { requireRole } from '../auth/plugin.js'
import { listUsersForAdmin } from '../auth/service.js'
import { getSourcesLastCheckedAt, resourceActiveEventSources } from '../events/resourcing.js'
import { sendTestNewsletterEmail } from '../newsletter/service.js'

// First admin view in the app (see CLAUDE.md's Introspectability section) —
// everyone else so far has been ad-hoc per-feature admin gating, not a
// dedicated section. Grows here rather than each feature inventing its own.
export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/users', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const rows = await listUsersForAdmin()
    return reply.send({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        avatar_url: row.avatarUrl,
        created_at: row.createdAt,
        invited_by_name: row.invitedByName,
        newsletter_subscribed: row.newsletterSubscribed,
      })),
      has_more: false,
      next_cursor: null,
    })
  })

  // Dev tool (feedback #38): lets an admin see a live newsletter render
  // without waiting for the Sunday cron or affecting any other recipient.
  app.post('/admin/newsletter/test-send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const user = request.currentUser!
    if (!user.email) {
      return reply.code(400).send({ error: { message: 'Your account has no email on file' } })
    }
    await sendTestNewsletterEmail({ id: user.id, name: user.name, email: user.email })
    return reply.send({ sent: true })
  })

  // Lets Developer Tools show "Sources last checked: ..." before the admin
  // has clicked anything (feedback #41 follow-up), not just after a run.
  app.get('/admin/events/resource', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const lastCheckedAt = await getSourcesLastCheckedAt()
    return reply.send({ data: { last_checked_at: lastCheckedAt } })
  })

  // Dev tool (feedback #41): re-runs the ingestion pipeline against every
  // known active source on demand, instead of waiting for a manual sourcing
  // pass. Scoped to known sources only, not new-source discovery — see
  // resourcing.ts.
  app.post('/admin/events/resource', { preHandler: requireRole('admin') }, async (request, reply) => {
    const report = await resourceActiveEventSources(`admin:${request.currentUser!.id}`)
    return reply.send({
      data: {
        sources_checked: report.sourcesChecked,
        total_added: report.totalAdded,
        total_skipped: report.totalSkipped,
        last_checked_at: report.lastCheckedAt,
        results: report.results.map((r) => ({
          source_id: r.sourceId,
          name: r.name,
          added: r.added,
          skipped: r.skipped,
          error: r.error,
        })),
      },
    })
  })
}
