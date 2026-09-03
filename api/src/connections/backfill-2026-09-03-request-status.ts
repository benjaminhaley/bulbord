import 'dotenv/config'

import { eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { eventsLog, userConnections } from '../db/schema.js'

// Feedback #127 (2026-09-03): migrates the old instant-add data into the
// new request/accept model. Run once, after migrations 0040/0041 have both
// applied (adds `status`, drops the now-unused `notify` column) — see
// schema.ts's userConnections comment for the target shape.
//
// The mapping is the natural one: an existing MUTUAL pair (both directions'
// rows already active) already represented two people who both know and
// added each other, so it collapses into ONE row with status='accepted' —
// the other direction's row is soft-deleted rather than a real relationship
// living in two places at once. An existing ONE-DIRECTIONAL edge (only one
// direction ever existed) already represented "one person added the other,
// unreciprocated" — under the new model that's exactly what a pending
// request is, so it just gets status='pending' (already the column
// default, set explicitly here for a clear log of what happened).
//
// Which row survives a mutual pair: the earlier-created one (by
// createdAt) — treated as if that person had been the "original requester"
// whose request the later add implicitly accepted, which is the closest
// real-world reading of two people who each independently added the other
// around the same time.
async function main() {
  const rows = await db
    .select({ id: userConnections.id, userId: userConnections.userId, connectedUserId: userConnections.connectedUserId, createdAt: userConnections.createdAt })
    .from(userConnections)
    .where(isNull(userConnections.deletedAt))

  const byPairKey = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = [row.userId, row.connectedUserId].sort().join(':')
    const list = byPairKey.get(key) ?? []
    list.push(row)
    byPairKey.set(key, list)
  }

  let acceptedCount = 0
  let pendingCount = 0
  let collapsedCount = 0

  for (const [, pairRows] of byPairKey) {
    if (pairRows.length === 2) {
      // Mutual — both directions exist. Keep the earlier row as the
      // canonical accepted relationship; soft-delete the later one.
      const [earlier, later] = [...pairRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      await db.update(userConnections).set({ status: 'accepted', updatedAt: new Date() }).where(eq(userConnections.id, earlier.id))
      await db
        .update(userConnections)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(userConnections.id, later.id))
      acceptedCount++
      collapsedCount++
    } else {
      // One-directional — becomes a pending request.
      await db.update(userConnections).set({ status: 'pending', updatedAt: new Date() }).where(eq(userConnections.id, pairRows[0].id))
      pendingCount++
    }
  }

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-09-03-request-status',
    action: 'connections_migrated',
    metadata: { acceptedPairs: acceptedCount, collapsedDuplicateRows: collapsedCount, pendingRequests: pendingCount },
  })

  console.log(`Migrated ${acceptedCount} mutual pairs to accepted (collapsing ${collapsedCount} duplicate rows), ${pendingCount} one-directional edges to pending.`)
}

await main()
process.exit(0)
