// Pipeline Review (feedback #138, 2026-09-06): the weekly digest that pairs
// with the retimed event-sourcing-cron run (see sourcing-cron.ts) — a short
// summary of what one run did, with a link to the full admin review page
// (pipeline-review-service.ts) for the actual kept/rejected detail. Sent to
// every admin, not just Ben, matching the generalizable approver-role
// requirement (CLAUDE.md's Product shape).
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { userRoles, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification } from '../notifications/service.js'
import { getPipelineReviewCandidates, getPipelineReviewCandidatesSince } from './pipeline-review-service.js'
import { pipelineReviewSubject, renderPipelineReviewHtml } from './pipeline-review-template.js'

async function getAdminRecipients(): Promise<{ id: string; name: string; email: string }[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'admin'), isNull(userRoles.deletedAt), isNull(users.deletedAt)))
  return rows.filter((r): r is { id: string; name: string; email: string } => !!r.email)
}

// Called once per weekly cron run (sourcing-cron.ts), after the pipeline
// itself has finished — one email + one in-app notification per admin, not
// hardcoded to Ben, so a future delegated/automated approver is covered
// without a schema change (CLAUDE.md's Product shape).
export async function sendPipelineReviewEmailForRun(runStartedAt: Date): Promise<{ recipientCount: number }> {
  const [recipients, { kept, rejected }] = await Promise.all([
    getAdminRecipients(),
    getPipelineReviewCandidatesSince(runStartedAt),
  ])

  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const runDate = new Date()
  const html = renderPipelineReviewHtml({ runDate, kept, rejected, webUrl })
  const subject = pipelineReviewSubject(runDate, kept.length, rejected.length)
  const message = `${kept.length} event${kept.length === 1 ? '' : 's'} added, ${rejected.length} rejected — ready to review`

  await Promise.allSettled(
    recipients.map(async (recipient) => {
      await sendEmail(recipient.email, subject, html)
      await createNotification({
        userId: recipient.id,
        type: 'pipeline_review_ready',
        actorUserId: null,
        message,
        targetPath: '/admin/pipeline-review',
      })
    }),
  )

  return { recipientCount: recipients.length }
}

// Admin dev tool (mirrors sendTestCampReminderEmail's shape exactly): sends
// the exact same render, scoped to unreviewed candidates across all time
// (not "since some run start"), to just the requesting admin's own address —
// no state mutated, no notification created, so a preview can't be mistaken
// for the real thing landing in the review page's own history.
export async function sendTestPipelineReviewEmail(recipient: { name: string; email: string }): Promise<void> {
  const { kept, rejected } = await getPipelineReviewCandidates()
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const runDate = new Date()
  const html = renderPipelineReviewHtml({ runDate, kept, rejected, webUrl })
  await sendEmail(recipient.email, pipelineReviewSubject(runDate, kept.length, rejected.length, '[Test] '), html)
}
