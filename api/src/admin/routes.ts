import type { FastifyInstance } from 'fastify'

import { requireRole } from '../auth/plugin.js'
import { listUsersForAdmin } from '../auth/service.js'
import { getCampsLastUpdatedAt } from '../camps/staleness.js'
import { sendTestConnectionAlertEmail } from '../connections/service.js'
import { getSourcesLastCheckedAt, resourceActiveEventSources } from '../events/resourcing.js'
import { sendTestNewsletterEmail } from '../newsletter/service.js'
import { impersonateUser } from './impersonation.js'
import { computeDataFreshness } from './staleness.js'

// How stale events/camps data can get before Developer Tools and the admin's
// own avatar flag it red (feedback #69) — a week is long enough that a
// missed weekly refresh pass is a real signal, not noise from day-to-day
// timing.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

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
        role: row.role,
        role_other: row.roleOther,
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

  // Dev tool: preview the "X added you as a friend" alert email
  // (connections/template.ts) without needing a second real account.
  app.post('/admin/connections/test-send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const user = request.currentUser!
    if (!user.email) {
      return reply.code(400).send({ error: { message: 'Your account has no email on file' } })
    }
    await sendTestConnectionAlertEmail({ name: user.name, email: user.email, avatarUrl: user.avatarUrl })
    return reply.send({ sent: true })
  })

  // Lets Developer Tools show "Sources last checked: ..." before the admin
  // has clicked anything (feedback #41 follow-up), not just after a run.
  app.get('/admin/events/resource', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const lastCheckedAt = await getSourcesLastCheckedAt()
    return reply.send({ data: { last_checked_at: lastCheckedAt } })
  })

  // Feedback #69: lets Developer Tools show "how stale is our data" for both
  // events and camps, and the admin's own avatar (InstitutionBanner) flag it
  // red without loading Dev Tools first. "Oldest" is whichever of the two is
  // farther in the past — the whole point is to catch the one that's been
  // neglected longest, not to average them out.
  app.get('/admin/data-freshness', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const [eventsLastCheckedAt, campsLastUpdatedAt] = await Promise.all([getSourcesLastCheckedAt(), getCampsLastUpdatedAt()])
    const freshness = computeDataFreshness(eventsLastCheckedAt, campsLastUpdatedAt, STALE_AFTER_MS)
    return reply.send({
      data: {
        events_last_checked_at: freshness.eventsLastCheckedAt,
        camps_last_updated_at: freshness.campsLastUpdatedAt,
        oldest_at: freshness.oldestAt,
        is_stale: freshness.isStale,
      },
    })
  })

  // Feedback #87: a short-lived (~1hr) real session for any member,
  // delivered as a ?signInToken= link (see impersonation.ts) — lets an
  // admin see the app as that member without their device, for testing or
  // demos.
  app.post('/admin/users/:id/impersonate', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await impersonateUser(id, request.currentUser!.id)
    if (!result) {
      return reply.code(404).send({ error: { message: 'User not found' } })
    }
    return reply.send({ data: { url: result.url, expires_at: result.expiresAt } })
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
