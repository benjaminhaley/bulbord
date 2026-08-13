import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: per Ben's direct request, #61 is now
// a clean iOS-only record with no Android mentions anywhere (title or body),
// trimmed down to just its next step rather than the full status-update
// history. Android already had its own item (#66, split out 2026-08-12) --
// per Ben's answer, that gets a shorter title/description in the same pass
// instead of a brand-new duplicate item.

const FEEDBACK_61_TITLE = 'create iOS app'
const FEEDBACK_61_DESCRIPTION = `iOS app was submitted for App Store review on 2026-08-12 (build 14).

Next step: check whether Apple's review is complete.`

const FEEDBACK_66_TITLE = 'Add Android support'
const FEEDBACK_66_DESCRIPTION = `Build and submit the Android app. Needs its own Play Console developer account and Google's mandatory 14-day/20-tester closed-testing window before it can go live.`

async function updateFeedback(number: number, title: string, description: string) {
  const [row] = await db.select({ id: feedback.id }).from(feedback).where(eq(feedback.number, number))
  if (!row) throw new Error(`feedback #${number} not found`)

  await db.update(feedback).set({ title, description, updatedAt: new Date() }).where(eq(feedback.id, row.id))

  await db.insert(eventsLog).values({
    actor: 'claude:feedback-status-update-2026-08-13',
    action: 'feedback_updated',
    metadata: {
      feedbackNumber: number,
      fields: ['title', 'description'],
      reason: 'removed Android mentions from #61 and shortened it to just the next step; shortened #66 in place instead of creating a duplicate Android item',
    },
  })

  console.log(`Updated feedback #${number}.`)
}

async function main() {
  await updateFeedback(61, FEEDBACK_61_TITLE, FEEDBACK_61_DESCRIPTION)
  await updateFeedback(66, FEEDBACK_66_TITLE, FEEDBACK_66_DESCRIPTION)
}

await main()
process.exit(0)
