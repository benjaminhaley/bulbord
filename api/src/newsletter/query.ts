import { and, asc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventInterests, users } from '../db/schema.js'

interface InterestedPerson {
  id: string
  name: string
}

export interface WeeklyEvent {
  id: string
  title: string
  description: string | null
  startDate: string
  startTime: string | null
  allDay: boolean
  address: string | null
  locationName: string | null
  thumbnailUrl: string | null
  interestedCount: number
  interestedNames: InterestedPerson[]
}

// Mirrors the next-occurrence-collapse + interest-count aggregation used by
// GET /events (api/src/events/routes.ts's next_occurrence/interest_counts
// CTEs), but scoped to an explicit [fromDate, toDate] range and with no
// pagination or viewer-specific filtering — deliberately a parallel
// implementation rather than a shared refactor of that endpoint, since this
// query has different shape needs (one result reused across every
// recipient) and reshaping the live, well-exercised route risks a
// regression there for this lower-traffic feature's sake.
//
// Interested names carry each person's id (not a pre-substituted "You") —
// one query result is rendered once per recipient, so the "You" swap
// happens per-recipient at render time instead (see format.ts).
export async function getWeeklyEvents(fromDate: string, toDate: string): Promise<WeeklyEvent[]> {
  const conditions = [
    eq(events.status, 'approved'),
    isNull(events.deletedAt),
    sql`${events.startDate} between ${fromDate} and ${toDate}`,
  ]

  const sortTimeExpr = sql`coalesce(${events.startTime}, '23:59:59'::time)`

  const nextOccurrence = db.$with('next_occurrence').as(
    db
      .select({
        ...getTableColumns(events),
        rn: sql<number>`row_number() over (partition by ${events.title}, coalesce(${events.sourceUrl}, ${events.id}::text) order by ${events.startDate} asc, ${sortTimeExpr} asc, ${events.id} asc)`.as(
          'rn',
        ),
        sortTime: sortTimeExpr.as('sort_time'),
      })
      .from(events)
      .where(and(...conditions)),
  )

  const interestCounts = db.$with('interest_counts').as(
    db
      .select({
        eventId: eventInterests.eventId,
        interestedCount: sql<number>`count(*) filter (where ${eventInterests.status} = 'interested')::int`.as(
          'interested_count',
        ),
        interestedNames: sql<InterestedPerson[]>`coalesce(json_agg(json_build_object('id', ${eventInterests.userId}, 'name', ${users.name}) order by ${eventInterests.createdAt}) filter (where ${eventInterests.status} = 'interested'), '[]'::json)`.as(
          'interested_names',
        ),
      })
      .from(eventInterests)
      .innerJoin(users, eq(users.id, eventInterests.userId))
      .where(isNull(eventInterests.deletedAt))
      .groupBy(eventInterests.eventId),
  )

  return db
    .with(nextOccurrence, interestCounts)
    .select({
      id: nextOccurrence.id,
      title: nextOccurrence.title,
      description: nextOccurrence.description,
      startDate: nextOccurrence.startDate,
      startTime: nextOccurrence.startTime,
      allDay: nextOccurrence.allDay,
      address: nextOccurrence.address,
      locationName: nextOccurrence.locationName,
      thumbnailUrl: nextOccurrence.thumbnailUrl,
      interestedCount: sql<number>`coalesce(${interestCounts.interestedCount}, 0)`,
      interestedNames: sql<InterestedPerson[]>`coalesce(${interestCounts.interestedNames}, '[]'::json)`,
    })
    .from(nextOccurrence)
    .leftJoin(interestCounts, eq(interestCounts.eventId, nextOccurrence.id))
    .where(eq(nextOccurrence.rn, 1))
    .orderBy(asc(nextOccurrence.startDate), asc(nextOccurrence.sortTime), asc(nextOccurrence.id))
}
