import { and, asc, eq, getTableColumns, isNull, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventInterests, users } from '../db/schema.js'
import { prioritizeNewsletterEvents, type WeeklyEventCandidate } from './prioritize.js'

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
  endTime: string | null
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
// A week with a lot of activity could otherwise produce an unbounded, very
// long email — capped at 10 (prioritize.ts's MAX_NEWSLETTER_EVENTS) after
// the non-recurring/recurring prioritization below, not by a plain SQL
// LIMIT on chronological order.
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

  // How many total (all-time, approved, non-deleted) rows share this same
  // series key — not scoped to [fromDate, toDate], deliberately: a weekly
  // series only ever has one occurrence inside any single week, so counting
  // within the newsletter's own window can't tell a recurring series apart
  // from a genuine one-time event. A series with more than one occurrence
  // anywhere (past or future) is "recurring" for feedback #143's purposes.
  const seriesCounts = db.$with('series_counts').as(
    db
      .select({
        title: events.title,
        seriesKey: sql`coalesce(${events.sourceUrl}, ${events.id}::text)`.as('series_key'),
        occurrenceCount: sql<number>`count(*)::int`.as('occurrence_count'),
      })
      .from(events)
      .where(and(eq(events.status, 'approved'), isNull(events.deletedAt)))
      .groupBy(events.title, sql`coalesce(${events.sourceUrl}, ${events.id}::text)`),
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

  const candidates: WeeklyEventCandidate[] = await db
    .with(nextOccurrence, interestCounts, seriesCounts)
    .select({
      id: nextOccurrence.id,
      title: nextOccurrence.title,
      description: nextOccurrence.description,
      startDate: nextOccurrence.startDate,
      startTime: nextOccurrence.startTime,
      endTime: nextOccurrence.endTime,
      allDay: nextOccurrence.allDay,
      address: nextOccurrence.address,
      locationName: nextOccurrence.locationName,
      thumbnailUrl: nextOccurrence.thumbnailUrl,
      interestedCount: sql<number>`coalesce(${interestCounts.interestedCount}, 0)`,
      interestedNames: sql<InterestedPerson[]>`coalesce(${interestCounts.interestedNames}, '[]'::json)`,
      isRecurring: sql<boolean>`coalesce(${seriesCounts.occurrenceCount}, 1) > 1`,
    })
    .from(nextOccurrence)
    .leftJoin(interestCounts, eq(interestCounts.eventId, nextOccurrence.id))
    .leftJoin(
      seriesCounts,
      and(
        eq(seriesCounts.title, nextOccurrence.title),
        eq(seriesCounts.seriesKey, sql`coalesce(${nextOccurrence.sourceUrl}, ${nextOccurrence.id}::text)`),
      ),
    )
    .where(eq(nextOccurrence.rn, 1))
    .orderBy(asc(nextOccurrence.startDate), asc(nextOccurrence.sortTime), asc(nextOccurrence.id))

  return prioritizeNewsletterEvents(candidates)
}
