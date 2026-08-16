import 'dotenv/config'

import { isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'

// One-off, run once against production alongside the friends_seen_at
// migration (feedback #94): sets friendsSeenAt = now() for every existing
// user, so an already-existing incoming connection doesn't read as a
// brand-new one the moment this feature ships (the column defaults to
// null, which getUnseenFriendCount() would otherwise treat as "never
// seen"). New accounts created after this need no backfill — their own
// createdAt is the fallback getUnseenFriendCount() uses for a null value.
async function main() {
  const updated = await db.update(users).set({ friendsSeenAt: new Date() }).where(isNull(users.friendsSeenAt)).returning({ id: users.id })
  console.log(`Backfilled friendsSeenAt for ${updated.length} existing user(s).`)
}

await main()
process.exit(0)
