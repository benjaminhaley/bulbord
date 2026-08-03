import 'dotenv/config'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendNewsletterEmail } from './mailer.js'
import { getWeeklyEvents } from './query.js'
import { createUnsubscribeToken } from './service.js'
import { formatWeeklyEvents, renderNewsletterHtml } from './template.js'
import { getUpcomingWeekRange } from './week.js'

// Invoked weekly by the Railway cron service (Sunday night, Chicago time) —
// same standalone-script shape as api/src/events/backfill-*.ts: no Fastify
// app/request/reply, just db + schema directly, exiting when done.
async function main() {
  const { monday, sunday } = getUpcomingWeekRange()
  const weekEvents = formatWeeklyEvents(await getWeeklyEvents(monday, sunday))

  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.newsletterSubscribed, true), isNotNull(users.email), isNull(users.deletedAt)))

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const subject = `This week on Nettelhorst: ${weekEvents.length} event${weekEvents.length === 1 ? '' : 's'}`

  // Each recipient's send is an independent Resend call — sent in parallel
  // rather than awaited one at a time in a loop. allSettled rather than all,
  // so one bad address doesn't abort everyone else's newsletter.
  const results = await Promise.allSettled(
    recipients
      .filter((recipient): recipient is typeof recipient & { email: string } => recipient.email !== null)
      .map((recipient) => {
        const html = renderNewsletterHtml({
          events: weekEvents,
          recipient: { id: recipient.id, name: recipient.name },
          apiUrl,
          webUrl,
          unsubscribeUrl: `${apiUrl}/newsletter/unsubscribe?token=${createUnsubscribeToken(recipient.id)}`,
        })
        return sendNewsletterEmail(recipient.email, subject, html)
      }),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected')
  for (const failure of failed) {
    console.error('Newsletter send failed:', failure.reason)
  }

  await db.insert(eventsLog).values({
    actor: 'system:newsletter-cron',
    action: 'newsletter_sent',
    metadata: { recipientCount: sent, failedCount: failed.length, eventCount: weekEvents.length, weekStart: monday, weekEnd: sunday },
  })

  console.log(`Newsletter sent to ${sent} recipient(s) (${failed.length} failed) covering ${weekEvents.length} event(s) for ${monday}–${sunday}.`)
}

await main()
process.exit(0)
