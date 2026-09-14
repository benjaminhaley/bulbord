import { eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps } from '../db/schema.js'
import type { BookingStatusCampRow } from './booking-status-health.js'

// Kept separate from booking-status-health.ts's pure findStaleBookingStatuses
// (same split as recurring-series-health.ts/recurring-series-query.ts) so
// that file's own test can import it without transitively requiring
// DATABASE_URL to be set.
export async function getCampBookingStatuses(): Promise<BookingStatusCampRow[]> {
  const rows = await db
    .select({
      campId: camps.id,
      title: camps.title,
      sourceId: camps.sourceId,
      sourceName: campSources.name,
      startDate: camps.startDate,
      bookingStatus: camps.bookingStatus,
    })
    .from(camps)
    .leftJoin(campSources, eq(campSources.id, camps.sourceId))
    .where(isNull(camps.deletedAt))
  return rows
}
