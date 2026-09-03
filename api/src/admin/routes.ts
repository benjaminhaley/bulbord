import type { FastifyInstance } from 'fastify'

import { getAnalyticsSummary } from '../analytics/service.js'
import { requireRole } from '../auth/plugin.js'
import { listUsersForAdmin } from '../auth/service.js'
import { sendTestCampReminderEmail } from '../camp-reminders/service.js'
import { getCampsLastUpdatedAt } from '../camps/staleness.js'
import { createTestFriendRequest, sendTestConnectionAlertEmail } from '../connections/service.js'
import { todayInChicago } from '../dates.js'
import { findLowRecurringSeries } from '../events/recurring-series-health.js'
import { getApprovedEventOccurrences } from '../events/recurring-series-query.js'
import { processInboundEmail } from '../events/email-ingest.js'
import {
  getLatestEventSourcingRun,
  getSourcesLastCheckedAt,
  resourceActiveEventSources,
  type ResourceReport,
} from '../events/resourcing.js'
import { sendTestNewsletterEmail } from '../newsletter/service.js'
import { impersonateUser } from './impersonation.js'
import { deleteMember } from './memberDeletion.js'
import { computeDataFreshness } from './staleness.js'

// How stale events/camps data can get before Developer Tools and the admin's
// own avatar flag it red (feedback #69) — a week is long enough that a
// missed weekly refresh pass is a real signal, not noise from day-to-day
// timing.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

// Shared by the manual re-run button and the "last run" summary (feedback
// #131) so both render the same shape whether the run was just triggered or
// read back from a past one (manual or the weekly cron).
function serializeResourceReport(report: ResourceReport) {
  return {
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
  }
}

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

  // Dev tool (feedback #120): preview the "day off camp" reminder email
  // without waiting for the real 28-days-before trigger. Sends whatever the
  // soonest upcoming break with real camps listed would actually look like
  // — see camp-reminders/service.ts for why this ignores the real due-date
  // gate rather than only working on the exact day a break would fire.
  app.post('/admin/camp-reminders/test-send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const user = request.currentUser!
    if (!user.email) {
      return reply.code(400).send({ error: { message: 'Your account has no email on file' } })
    }
    const result = await sendTestCampReminderEmail({ id: user.id, name: user.name, email: user.email })
    if (result === 'no_upcoming_camps') {
      return reply.code(400).send({ error: { message: 'No upcoming school break currently has any camps listed' } })
    }
    return reply.send({ sent: true })
  })

  // Dev tool: preview the "X sent you a friend request" alert email
  // (connections/template.ts) without needing a second real account.
  app.post('/admin/connections/test-send', { preHandler: requireRole('admin') }, async (request, reply) => {
    const user = request.currentUser!
    if (!user.email) {
      return reply.code(400).send({ error: { message: 'Your account has no email on file' } })
    }
    await sendTestConnectionAlertEmail({ name: user.name, email: user.email, avatarUrl: user.avatarUrl })
    return reply.send({ sent: true })
  })

  // Dev tool (feedback, 2026-08-16; reworked into a real request/accept
  // model by feedback #127): unlike the email preview above, this creates a
  // real throwaway member that actually sends the admin a friend request —
  // the full real path (alert email, in-app notification), repeatable on
  // demand rather than a one-off script, and testable end-to-end against
  // the real Accept/Decline buttons on the admin's own Friends page. Delete
  // the resulting account from All members when done.
  app.post('/admin/connections/test-request', { preHandler: requireRole('admin') }, async (request, reply) => {
    const testUser = await createTestFriendRequest(request.currentUser!.id)
    return reply.send({ data: testUser })
  })

  // Lets Developer Tools show "Sources last checked: ..." before the admin
  // has clicked anything (feedback #41 follow-up), not just after a run —
  // and, since feedback #131 added a weekly automated run alongside the
  // manual button, the full summary of whichever run (auto or manual)
  // happened most recently, so a weekly cron run that happened overnight
  // is visible the next time an admin opens this page, not just right
  // after clicking the button themselves.
  app.get('/admin/events/resource', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const [lastCheckedAt, lastRun] = await Promise.all([getSourcesLastCheckedAt(), getLatestEventSourcingRun()])
    return reply.send({
      data: {
        last_checked_at: lastCheckedAt,
        last_run: lastRun ? { actor: lastRun.actor, ran_at: lastRun.ranAt, ...serializeResourceReport(lastRun.report) } : null,
      },
    })
  })

  // Feedback #69: lets Developer Tools show "how stale is our data" for both
  // events and camps, and the admin's own avatar (InstitutionBanner) flag it
  // red without loading Dev Tools first. "Oldest" is whichever of the two is
  // farther in the past — the whole point is to catch the one that's been
  // neglected longest, not to average them out.
  //
  // recurring_series_running_low (feedback #119) is a different axis than
  // the two timestamps above — those measure "have we looked recently";
  // this measures "is a specific recurring listing's real published
  // schedule about to run dry regardless of when we last looked" (see
  // events/recurring-series-health.ts for why the earlier check alone
  // wasn't enough to catch the Nettelhorst French Market going stale).
  // Bundled into this same endpoint/badge rather than a separate one, since
  // from the admin's perspective both are the same kind of nudge: "some
  // event-sourcing data needs your attention."
  app.get('/admin/data-freshness', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const [eventsLastCheckedAt, campsLastUpdatedAt, seriesRows] = await Promise.all([
      getSourcesLastCheckedAt(),
      getCampsLastUpdatedAt(),
      getApprovedEventOccurrences(),
    ])
    const freshness = computeDataFreshness(eventsLastCheckedAt, campsLastUpdatedAt, STALE_AFTER_MS)
    const lowSeries = findLowRecurringSeries(seriesRows, todayInChicago())
    return reply.send({
      data: {
        events_last_checked_at: freshness.eventsLastCheckedAt,
        camps_last_updated_at: freshness.campsLastUpdatedAt,
        oldest_at: freshness.oldestAt,
        is_stale: freshness.isStale,
        recurring_series_running_low: lowSeries.map((s) => ({
          title: s.title,
          source_id: s.sourceId,
          source_name: s.sourceName,
          occurrence_count: s.occurrenceCount,
          last_occurrence_date: s.lastOccurrenceDate,
          typical_gap_days: s.typicalGapDays,
          days_until_last_occurrence: s.daysUntilLastOccurrence,
        })),
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

  // Feedback #92: lets an admin remove a member, for testing (cleaning up
  // throwaway accounts made while trying the app) and moderation.
  app.delete('/admin/users/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await deleteMember(id, request.currentUser!.id)
    if (result.error === 'not_found') {
      return reply.code(404).send({ error: { message: 'User not found' } })
    }
    if (result.error === 'not_self') {
      return reply.code(400).send({ error: { message: "You can't delete your own account" } })
    }
    return reply.send({ data: { deleted: true } })
  })

  // Feedback #96: the basics at a glance — today's/this-week's active
  // members, who's viewing/sharing this week, a 30-day daily-active chart,
  // last-active-per-member, and a curated recent-activity log. See
  // analytics/service.ts for what's tracked and why.
  app.get('/admin/analytics/summary', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { actor_id, actor_mode } = request.query as { actor_id?: string; actor_mode?: string }
    const mode = actor_mode === 'exclude' ? 'exclude' : 'include'
    const summary = await getAnalyticsSummary(actor_id ? { actorId: actor_id, mode } : undefined)
    return reply.send({
      data: {
        active_today: summary.activeToday,
        active_this_week: summary.activeThisWeek,
        event_viewers_7d: summary.eventViewers7d,
        camp_viewers_7d: summary.campViewers7d,
        sharers_7d: summary.sharers7d,
        dau: summary.dau,
        last_active_by_member: summary.lastActiveByMember.map((m) => ({
          user_id: m.userId,
          name: m.name,
          avatar_url: m.avatarUrl,
          last_active_at: m.lastActiveAt,
        })),
        recent_log: summary.recentLog.map((entry) => ({
          id: entry.id,
          actor: entry.actor,
          actor_name: entry.actorName,
          action: entry.action,
          metadata: entry.metadata,
          created_at: entry.createdAt,
        })),
      },
    })
  })

  // Dev tool (feedback #41): re-runs the ingestion pipeline against every
  // known active source on demand, instead of waiting for a manual sourcing
  // pass. Scoped to known sources only, not new-source discovery — see
  // resourcing.ts.
  app.post('/admin/events/resource', { preHandler: requireRole('admin') }, async (request, reply) => {
    const actor = `admin:${request.currentUser!.id}`
    const report = await resourceActiveEventSources(actor)
    return reply.send({ data: { actor, ran_at: new Date(), ...serializeResourceReport(report) } })
  })

  // Dev tool (feedback #115): run the exact same extraction/ingestion pass
  // a real inbound email webhook triggers, but against pasted-in text —
  // works today even before the real Resend receiving-domain/webhook setup
  // is finished (see CLAUDE.md's Events data model & sourcing section), and
  // doubles as a repeatable way to test the pipeline afterward too.
  app.post('/admin/events/test-email-ingest', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { from_address, subject, body } = (request.body ?? {}) as { from_address?: string; subject?: string; body?: string }
    if (!from_address || !body) {
      return reply.code(400).send({ error: { message: 'from_address and body are required' } })
    }
    const result = await processInboundEmail({ fromAddress: from_address, fromName: null, subject: subject ?? '(no subject)', text: body, html: null })
    return reply.send({ data: { added: result.added, skipped: result.skipped } })
  })
}
