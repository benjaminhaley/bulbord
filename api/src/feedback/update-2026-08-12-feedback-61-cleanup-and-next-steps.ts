import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: per Ben's explicit request, removes
// the Android-specific portions of feedback #61 now that Android is tracked
// separately in #66 (see the 2026-08-12 split note already in this item),
// and appends a final status update covering what happens next once Apple
// responds. This replaces the whole description (not just an append) since
// it edits earlier paragraphs, not just adds a new one -- an explicit,
// one-off exception to this repo's usual append-only convention for status
// notes, done because Ben asked for it directly on his own post.
const FEEDBACK_NUMBER = 61

const NEW_DESCRIPTION = `this is an Wahl project but pretty important. We'd like to create an app version of this. Ideally, it'd be identical to the website and just a thin wrapper around it. Ideally, it would update as easily as the website does of course in practice that's going to be difficult it's important that we build these two France without slowing down development speed so I'll be looking for a plan there but we also need to kick off App Store review as soon as possible and so we need to get going on the process. Please go through a round of interactive planning with me in terms of how we can best get close to achieving these goals. From the user interface point of view, the app should be the one that most people access the site through. I'll probably continue to use Web as kind of a beta tester. Perhaps other people will in that same capacity, but for the mainstream user, it's gotta be the app. The reason is otherwise it's too easy to lose track of.

---

(Claude status update, 2026-08-07): In progress -- did a round of interactive planning per your ask. Landed the architecture piece: the native app now loads the live site directly (server.url in capacitor.config.ts) instead of bundling a build, so future web deploys reach the app instantly with no store resubmission -- the actual mechanism behind "update as easily as the website." Also scaffolded a CI pipeline (GitHub Actions + Fastlane) so builds and submissions run without anyone needing a physical Mac, and drafted the privacy policy (live at nettelhorst.bulbord.com/privacy.html) and store listing copy needed for submission.

Still blocked on you for one thing only you can do: enroll in the Apple Developer Program (Individual, ~$99/yr) at developer.apple.com.

---

(Claude split note, 2026-08-12): iOS is done -- verified end-to-end, a real signed build reached App Store Connect and is processing for TestFlight. Android is on a fully separate, longer timeline (Play Console's mandatory 20-tester/14-day closed-testing window), so split it out into its own item: #66.

---

(Claude status update, 2026-08-12): Submitted -- the iOS app (build 12) was submitted for App Store review today via the App Store Connect API directly (pricing, content rights, iPhone-only device family, and the reviewSubmissions POST itself all done programmatically). A dedicated "App Review" account plus a one-tap sign-in link solve Apple's demo-account requirement for this passkey-only app -- no password to hand a reviewer. Typical first-review turnaround is 24-48 hours; I'll let you know as soon as there's a decision.

---

(Claude status update, 2026-08-12): Correction to the earlier "Submitted" update -- that first submission (build 12) was withdrawn the same day. You caught two real problems: it had never actually been tested on a device, and the reviewer sign-in link opened Safari instead of the app itself (WKWebView has its own separate storage from Safari, so that link could never have worked for reviewing the actual app). Fixing the link properly (real Universal Links, not a workaround) surfaced two more pre-existing bugs the moment a real device could try native passkeys for the first time: the passkey config was pointed at the wrong domain, and the AASA file was served with no Content-Type. All four fixed, and you personally verified native passkey sign-in and the Universal Link both work on your own device before this resubmission. Resubmitted today with build 14 -- state: WAITING_FOR_REVIEW.

---

(Claude status update, 2026-08-12): Next steps once Apple responds --

If approved: the version is set to release "After Approval," not automatically, so someone still needs to trigger the actual release once Apple signs off. I'll do that the moment we hear back via the same API access used throughout this item, no action needed from you. Once released, the app becomes installable from the App Store -- worth letting existing Nettelhorst members know they can switch from the website to the app then, since that's the whole point of this item. (Bulbord itself stays invite-only regardless -- installing the app doesn't change who can see content.)

If rejected: Apple gives a specific reason in the rejection notes. I'll read it, fix whatever's flagged, and resubmit the same way this round went -- no action needed from you unless it's something only you can address (an account-level or business/legal question).

This item is otherwise done pending Apple's decision. Android is tracked separately in #66.`

async function main() {
  const [row] = await db.select({ id: feedback.id }).from(feedback).where(eq(feedback.number, FEEDBACK_NUMBER))
  if (!row) throw new Error(`feedback #${FEEDBACK_NUMBER} not found`)

  await db.update(feedback).set({ description: NEW_DESCRIPTION, updatedAt: new Date() }).where(eq(feedback.id, row.id))

  await db.insert(eventsLog).values({
    actor: 'claude:feedback-status-update-2026-08-12c',
    action: 'feedback_updated',
    metadata: { feedbackNumber: FEEDBACK_NUMBER, field: 'description', reason: 'removed Android portions per Ben, added next-steps summary' },
  })

  console.log(`Cleaned up feedback #${FEEDBACK_NUMBER} and appended next-steps summary.`)
}

await main()
process.exit(0)
