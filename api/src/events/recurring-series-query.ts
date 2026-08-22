import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events } from '../db/schema.js'
import type { RecurringSeriesRow } from './recurring-series-health.js'

// Kept separate from recurring-series-health.ts's pure findLowRecurringSeries
// (same split as camps/staleness.ts vs. admin/staleness.ts) so that file's
// own test can import it without transitively requiring DATABASE_URL to be
// set — every other test in this repo mocks db/client.js or avoids it
// entirely rather than touching a real Postgres.
//
// Only approved, non-deleted events count — a pending/rejected row was never
// a real, published occurrence a member could have seen, so it shouldn't
// count toward (or against) a series' established cadence.
export async function getApprovedEventOccurrences(): Promise<RecurringSeriesRow[]> {
  return db
    .select({ title: events.title, sourceId: events.sourceId, sourceName: eventSources.name, startDate: events.startDate })
    .from(events)
    .leftJoin(eventSources, eq(eventSources.id, events.sourceId))
    .where(and(eq(events.status, 'approved'), isNull(events.deletedAt)))
}
