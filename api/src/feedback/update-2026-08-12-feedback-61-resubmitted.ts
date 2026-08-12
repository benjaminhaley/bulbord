import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: corrects and updates feedback #61
// -- the earlier "submitted" status update turned out to be premature. Ben
// caught two real problems (untested on device, sign-in link only worked
// in Safari) and had it withdrawn same-day; fixing that surfaced two more
// pre-existing bugs on the first real on-device passkey attempt. See
// CLAUDE.md's Platform strategy for the full build-by-build account.
const FEEDBACK_NUMBER = 61

const STATUS_UPDATE = `

---

(Claude status update, 2026-08-12): Correction to the earlier "Submitted" update -- that first submission (build 12) was withdrawn the same day. You caught two real problems: it had never actually been tested on a device, and the reviewer sign-in link opened Safari instead of the app itself (WKWebView has its own separate storage from Safari, so that link could never have worked for reviewing the actual app). Fixing the link properly (real Universal Links, not a workaround) surfaced two more pre-existing bugs the moment a real device could try native passkeys for the first time: the passkey config was pointed at the wrong domain, and the AASA file was served with no Content-Type. All four fixed, and you personally verified native passkey sign-in and the Universal Link both work on your own device before this resubmission. Resubmitted today with build 14 -- state: WAITING_FOR_REVIEW.`

async function main() {
  const [row] = await db.select({ id: feedback.id, description: feedback.description }).from(feedback).where(eq(feedback.number, FEEDBACK_NUMBER))
  if (!row) throw new Error(`feedback #${FEEDBACK_NUMBER} not found`)

  const updatedDescription = (row.description ?? '') + STATUS_UPDATE

  await db.update(feedback).set({ description: updatedDescription, updatedAt: new Date() }).where(eq(feedback.id, row.id))

  await db.insert(eventsLog).values({
    actor: 'claude:feedback-status-update-2026-08-12b',
    action: 'feedback_updated',
    metadata: { feedbackNumber: FEEDBACK_NUMBER, field: 'description', reason: 'iOS resubmission status correction' },
  })

  console.log(`Appended resubmission status update to feedback #${FEEDBACK_NUMBER}.`)
}

await main()
process.exit(0)
