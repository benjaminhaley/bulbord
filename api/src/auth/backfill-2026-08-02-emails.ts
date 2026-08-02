import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'

// One-off, run once against production: backfills email for the two
// pre-newsletter accounts (feedback #25338333 named these two addresses
// explicitly) and soft-deletes the dormant duplicate root account created
// while testing the bootstrap flow twice — soft-deleted, not hard-deleted,
// per CLAUDE.md's recoverability rule.
const ACTIVE_BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'
const STALE_BEN_USER_ID = 'd69c3f27-0cad-4ed9-9692-dd0ecc4799e3'
const ANNA_USER_ID = '684385bb-fdad-4cf6-b8c4-0d3eec33dd92'

async function main() {
  await Promise.all([
    db.update(users).set({ email: 'benjamin.haley@gmail.com', updatedAt: new Date() }).where(eq(users.id, ACTIVE_BEN_USER_ID)),
    db.update(users).set({ email: 'anna.piepmeyer@gmail.com', updatedAt: new Date() }).where(eq(users.id, ANNA_USER_ID)),
    db.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, STALE_BEN_USER_ID)),
  ])

  await db.insert(eventsLog).values([
    { actor: 'claude:email-backfill-2026-08-02', action: 'profile_updated', metadata: { userId: ACTIVE_BEN_USER_ID, field: 'email' } },
    { actor: 'claude:email-backfill-2026-08-02', action: 'profile_updated', metadata: { userId: ANNA_USER_ID, field: 'email' } },
    { actor: 'claude:email-backfill-2026-08-02', action: 'user_deleted', metadata: { userId: STALE_BEN_USER_ID, reason: 'dormant duplicate root account' } },
  ])

  console.log('Backfilled emails for 2 accounts; soft-deleted 1 dormant duplicate account.')
}

await main()
process.exit(0)
