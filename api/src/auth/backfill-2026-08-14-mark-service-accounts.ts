import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'

// One-off: flags the existing Apple App Review account (see
// update-2026-08-12-create-reviewer-account.ts) as a service account now
// that users.is_service_account exists, so it stops showing up as a friend
// suggestion (feedback, 2026-08-14). Any future operational account should
// be created with isServiceAccount: true directly rather than needing its
// own backfill.
async function main() {
  const [updated] = await db
    .update(users)
    .set({ isServiceAccount: true, updatedAt: new Date() })
    .where(eq(users.email, 'app-review@bulbord.com'))
    .returning()

  if (!updated) {
    console.log('No app-review@bulbord.com account found — nothing to do.')
    process.exit(0)
  }

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-08-14-mark-service-accounts',
    action: 'user_updated',
    metadata: { userId: updated.id, isServiceAccount: true },
  })

  console.log(`Marked ${updated.id} (${updated.email}) as a service account.`)
}

await main()
process.exit(0)
