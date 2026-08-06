import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'

// One-off, run once against production: the new role field (feedback #49)
// only asks new signups going forward — confirmed with Ben, 2026-08-05 — but
// he asked that the two existing accounts (himself and Anna) be labeled
// 'family' ("parents") directly rather than left null. Run after
// backfill-2026-08-05-merge-duplicate-anna.ts, which is why this uses Anna's
// surviving (newer) account id.
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'
const ANNA_USER_ID = 'b09a41cb-d7de-4baa-8b6e-a700821de6ae'

async function main() {
  await Promise.all([
    db.update(users).set({ role: 'family', updatedAt: new Date() }).where(eq(users.id, BEN_USER_ID)),
    db.update(users).set({ role: 'family', updatedAt: new Date() }).where(eq(users.id, ANNA_USER_ID)),
  ])

  await db.insert(eventsLog).values([
    { actor: 'claude:role-backfill-2026-08-05', action: 'profile_updated', metadata: { userId: BEN_USER_ID, field: 'role', value: 'family' } },
    { actor: 'claude:role-backfill-2026-08-05', action: 'profile_updated', metadata: { userId: ANNA_USER_ID, field: 'role', value: 'family' } },
  ])

  console.log('Backfilled role=family for 2 existing accounts.')
}

await main()
process.exit(0)
