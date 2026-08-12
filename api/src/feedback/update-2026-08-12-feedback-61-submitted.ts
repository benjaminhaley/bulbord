import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: appends a final status update to
// feedback #61 now that the iOS app has actually been submitted for App
// Store review (not just built/verified) -- see this repo's convention of
// appending status notes rather than posting a new item.
const FEEDBACK_NUMBER = 61

const STATUS_UPDATE = `

---

(Claude status update, 2026-08-12): Submitted -- the iOS app (build 12) was submitted for App Store review today via the App Store Connect API directly (pricing, content rights, iPhone-only device family, and the reviewSubmissions POST itself all done programmatically). A dedicated "App Review" account plus a one-tap sign-in link solve Apple's demo-account requirement for this passkey-only app -- no password to hand a reviewer. Typical first-review turnaround is 24-48 hours; I'll let you know as soon as there's a decision. Android (#66) is still waiting on the Play Console account and its 14-day tester window, unrelated to this.`

async function main() {
  const [row] = await db.select({ id: feedback.id, description: feedback.description }).from(feedback).where(eq(feedback.number, FEEDBACK_NUMBER))
  if (!row) throw new Error(`feedback #${FEEDBACK_NUMBER} not found`)

  const updatedDescription = (row.description ?? '') + STATUS_UPDATE

  await db.update(feedback).set({ description: updatedDescription, updatedAt: new Date() }).where(eq(feedback.id, row.id))

  await db.insert(eventsLog).values({
    actor: 'claude:feedback-status-update-2026-08-12',
    action: 'feedback_updated',
    metadata: { feedbackNumber: FEEDBACK_NUMBER, field: 'description', reason: 'iOS App Store submission status update' },
  })

  console.log(`Appended submission status update to feedback #${FEEDBACK_NUMBER}.`)
}

await main()
process.exit(0)
