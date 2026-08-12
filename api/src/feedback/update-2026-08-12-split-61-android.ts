import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, feedback } from '../db/schema.js'

// One-off, run once against production: Ben asked to split feedback #61
// ("create iOS and android apps") so Android tracks separately from iOS,
// since their timelines are now fully independent -- iOS is verified
// end-to-end (a real signed build reached App Store Connect), while Android
// is still waiting on a Play Console account and the mandatory 14-day/
// 20-tester closed-testing window. Mirrors the real POST /feedback insert
// shape (api/src/feedback/routes.ts) and appends a status note to #61
// rather than silently leaving it looking Android-inclusive.
const ORIGINAL_FEEDBACK_NUMBER = 61
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'

const ANDROID_DESCRIPTION = `Split out from #${ORIGINAL_FEEDBACK_NUMBER} (iOS and Android) into its own item, since Android's path is fully independent of iOS from here on out. Play Console needs its own developer account, and Google requires 14 continuous days of closed testing with 20+ opted-in testers before production publishing unlocks at all -- independent of build quality, so that's the long pole here regardless of how ready the app is.

This tracks: creating the Play Console account, recruiting the 20 testers, and getting a first build through the Android CI pipeline (already scaffolded in .github/workflows/mobile-android.yml, not yet verified end-to-end).`

async function main() {
  const [original] = await db
    .select({ id: feedback.id, description: feedback.description })
    .from(feedback)
    .where(eq(feedback.number, ORIGINAL_FEEDBACK_NUMBER))
  if (!original) throw new Error(`feedback #${ORIGINAL_FEEDBACK_NUMBER} not found`)

  const [created] = await db
    .insert(feedback)
    .values({
      title: 'create android app',
      description: ANDROID_DESCRIPTION,
      createdByUserId: BEN_USER_ID,
    })
    .returning()

  const splitNote = `

---

(Claude split note, 2026-08-12): iOS is done -- verified end-to-end, a real signed build reached App Store Connect and is processing for TestFlight. Android is on a fully separate, longer timeline (Play Console's mandatory 20-tester/14-day closed-testing window), so split it out into its own item: #${created.number}.`

  await Promise.all([
    db
      .update(feedback)
      .set({ description: (original.description ?? '') + splitNote, updatedAt: new Date() })
      .where(eq(feedback.id, original.id)),
    db.insert(eventsLog).values([
      { actor: 'claude:feedback-split-2026-08-12', action: 'feedback_created', metadata: { feedbackId: created.id, splitFrom: ORIGINAL_FEEDBACK_NUMBER } },
      { actor: 'claude:feedback-split-2026-08-12', action: 'feedback_updated', metadata: { feedbackId: original.id, reason: 'split note appended' } },
    ]),
  ])

  console.log(`Created feedback #${created.number} (Android), split from #${ORIGINAL_FEEDBACK_NUMBER}.`)
}

await main()
process.exit(0)
