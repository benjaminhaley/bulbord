import 'dotenv/config'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { todayInChicago } from '../dates.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createUnsubscribeToken } from '../newsletter/service.js'
import { getCampsForDateRange, getCandidateBreaks, markBreakReminded } from './query.js'
import { campReminderSubject, formatReminderCamps, renderCampReminderHtml } from './template.js'
import { isReminderDue } from './window.js'

// Invoked daily by a dedicated Railway cron service (feedback #120), same
// standalone-script shape as newsletter/send-weekly.ts. Unlike the weekly
// newsletter (which always sends, every week, to every subscriber), most
// days this script finds nothing due and exits quietly — the "four weeks
// before a day off of CPS" trigger only fires on a handful of days a year,
// one email per continuous block (school_breaks is already stored as block
// ranges, e.g. "Parent-Teacher Conference Day & Election Day" is one row,
// not two), never once per individual day within it.
async function main() {
  const today = todayInChicago()
  const candidates = await getCandidateBreaks(today)
  const dueBreaks = candidates.filter((b) => isReminderDue(today, b.startDate, b.remindedAt))

  if (dueBreaks.length === 0) {
    console.log('No camp-date reminders due today.')
    return
  }

  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.newsletterSubscribed, true), isNotNull(users.email), isNull(users.deletedAt)))

  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')

  for (const brk of dueBreaks) {
    const camps = formatReminderCamps(await getCampsForDateRange(brk.startDate, brk.endDate))

    // No camps listed for this break yet — leave remindedAt unset so the
    // next run checks again, rather than either sending an empty "no camps"
    // email or silently giving up on this break forever (feedback #120:
    // "and you're the ones listed in the camp[s]... we should send an
    // email" implies there's something real to tell people about).
    if (camps.length === 0) {
      console.log(`Skipping "${brk.name}" — no camps listed yet, will re-check tomorrow.`)
      continue
    }

    const subject = campReminderSubject(brk.startDate, brk.endDate)
    const results = await Promise.allSettled(
      recipients
        .filter((r): r is typeof r & { email: string } => r.email !== null)
        .map((recipient) => {
          const html = renderCampReminderHtml({
            camps,
            breakName: brk.name,
            startDate: brk.startDate,
            endDate: brk.endDate,
            recipient: { id: recipient.id, name: recipient.name },
            apiUrl,
            webUrl,
            unsubscribeUrl: `${apiUrl}/newsletter/unsubscribe?token=${createUnsubscribeToken(recipient.id)}`,
          })
          return sendEmail(recipient.email, subject, html)
        }),
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected')
    for (const failure of failed) {
      console.error(`Camp reminder send failed for "${brk.name}":`, failure.reason)
    }

    await markBreakReminded(brk.id)
    await db.insert(eventsLog).values({
      actor: 'system:camp-reminder-cron',
      action: 'camp_reminder_sent',
      metadata: {
        breakId: brk.id,
        breakName: brk.name,
        startDate: brk.startDate,
        endDate: brk.endDate,
        recipientCount: sent,
        failedCount: failed.length,
        campCount: camps.length,
      },
    })

    console.log(
      `Camp reminder sent for "${brk.name}" to ${sent} recipient(s) (${failed.length} failed) covering ${camps.length} camp(s).`,
    )
  }
}

await main()
process.exit(0)
