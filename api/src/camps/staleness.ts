import { isNull, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps } from '../db/schema.js'

// Camps has no automated recheck job the way events' sourcing pipeline does
// (see events/resourcing.ts's getSourcesLastCheckedAt) — camp data is
// hand-researched via one-off backfill/seed scripts (see CLAUDE.md's Camps
// data model & sourcing section). The most recent time any camp row was
// touched is the best available proxy for "when was this data last
// refreshed" (feedback #69).
export async function getCampsLastUpdatedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastUpdatedAt: sql<Date | null>`max(${camps.updatedAt})` })
    .from(camps)
    .where(isNull(camps.deletedAt))
  return row?.lastUpdatedAt ?? null
}
