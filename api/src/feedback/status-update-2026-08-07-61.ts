import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: appends a status update to feedback
// #61's own description rather than posting a new item (see this repo's
// convention — status notes append, they never become their own card).
const FEEDBACK_NUMBER = 61

const STATUS_UPDATE = `

---

(Claude status update, 2026-08-07): In progress -- did a round of interactive planning per your ask. Landed the architecture piece: the native app now loads the live site directly (server.url in capacitor.config.ts) instead of bundling a build, so future web deploys reach the app instantly with no store resubmission -- the actual mechanism behind "update as easily as the website." Also scaffolded CI pipelines (GitHub Actions + Fastlane) so iOS/Android builds and submissions run without anyone needing a physical Mac, and drafted the privacy policy (live at nettelhorst.bulbord.com/privacy.html) and store listing copy needed for submission.

Still blocked on you for the two things only you can do, and both have long clocks so worth starting now regardless of build polish: (1) enroll in the Apple Developer Program (Individual, ~$99/yr) at developer.apple.com, and (2) create a Google Play Console account ($25) and start lining up 20 people willing to be closed-testing testers -- Google requires 14 continuous days of testing with 20+ testers before a new account can publish to production, independent of build quality, so that's likely the longest pole in the whole project.`

async function main() {
  const [row] = await db.select({ id: feedback.id, description: feedback.description }).from(feedback).where(eq(feedback.number, FEEDBACK_NUMBER))
  if (!row) throw new Error(`feedback #${FEEDBACK_NUMBER} not found`)

  const updatedDescription = (row.description ?? '') + STATUS_UPDATE

  await db.update(feedback).set({ description: updatedDescription, updatedAt: new Date() }).where(eq(feedback.id, row.id))

  await db.insert(eventsLog).values({
    actor: 'claude:feedback-status-update-2026-08-07',
    action: 'feedback_updated',
    metadata: { feedbackNumber: FEEDBACK_NUMBER, field: 'description', reason: 'status update appended' },
  })

  console.log(`Appended status update to feedback #${FEEDBACK_NUMBER}.`)
}

await main()
process.exit(0)
