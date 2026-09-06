import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog } from '../db/schema.js'
import { sendPipelineReviewEmailForRun } from './pipeline-review-email.js'
import { resourceActiveEventSources } from './resourcing.js'

// Invoked weekly by a dedicated Railway cron service (feedback #131: "Should
// be a weekly job"; retimed to Wednesday morning by feedback #138), same
// standalone-script shape as newsletter/send-weekly.ts and
// camp-reminders/send-due.ts. Runs the exact same pipeline as Dev Tools'
// "Re-run event sourcing" admin button (see resourcing.ts) — automating a
// pass an admin previously had to remember to trigger by hand.
// resourceActiveEventSources() itself writes the one `events_log` summary
// row Dev Tools reads back as "keep some summary in admin of what has
// changed."
//
// runStartedAt is captured before the pipeline runs (not derived from the
// event_sourcing_run log row's own createdAt, which is written only after
// every source finishes checking) so the follow-up review email can scope
// itself to exactly what this run produced — see pipeline-review-service.ts's
// getPipelineReviewCandidatesSince.
async function main() {
  const runStartedAt = new Date()
  const report = await resourceActiveEventSources('system:event-sourcing-cron')
  console.log(
    `Event sourcing run: checked ${report.sourcesChecked} source(s), added ${report.totalAdded}, skipped ${report.totalSkipped}.`,
  )
  for (const result of report.results) {
    if (result.error) {
      console.error(`  ${result.name}: error — ${result.error}`)
    } else if (result.added > 0) {
      console.log(`  ${result.name}: added ${result.added}, skipped ${result.skipped}`)
    }
  }

  const { recipientCount } = await sendPipelineReviewEmailForRun(runStartedAt)
  console.log(`Pipeline review email sent to ${recipientCount} admin(s).`)
  await db.insert(eventsLog).values({
    actor: 'system:event-sourcing-cron',
    action: 'pipeline_review_sent',
    metadata: { recipientCount },
  })
}

await main()
process.exit(0)
