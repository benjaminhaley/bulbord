import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventInterests } from '../db/schema.js'
import { wallClockToInstantMs } from '../timezone-core.js'
import { buildEventFilterConditions } from './filters.js'
import { interestedCountExpr, interestedPeopleExpr, serializeEvent, submittedByExpr, type InterestStatus } from './serialize.js'

// Deliberate parallel implementation of GET /events' own date-range query
// (feedback #97's calendar week view), same rationale as
// newsletter/query.ts's getWeeklyEvents(): the week view needs every real
// occurrence within an explicit Sunday-Saturday range, not the
// next-occurrence-collapsed set the main paginated list shows (a weekly
// recurring movie night should appear on its own actual date within the
// displayed week, not be hidden behind its series' single soonest row) — a
// genuinely different query shape, not a variant worth forcing into the
// list route's CTE.
function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getEventsForWeek(
  weekStart: string,
  topics: string[],
  beforeTime: string | null,
  afterTime: string | null,
  timeZone: string,
  currentUser: { id: string; roles: string[] } | null,
) {
  const userId = currentUser?.id ?? null
  const weekEnd = toISODate(addDays(parseISODate(weekStart), 6))

  const conditions = [
    eq(events.status, 'approved'),
    isNull(events.deletedAt),
    // The viewer's Sunday-Saturday week, in their own zone: a timed event
    // matches on its real instant; a date-only one (stored at Chicago
    // midnight) matches on its calendar date, so it never slides into a
    // neighbouring day for a viewer outside Chicago.
    or(
      and(
        eq(events.allDay, false),
        gte(events.startsAt, new Date(wallClockToInstantMs(weekStart, '00:00:00', timeZone))),
        lt(events.startsAt, new Date(wallClockToInstantMs(toISODate(addDays(parseISODate(weekEnd), 1)), '00:00:00', timeZone))),
      ),
      and(eq(events.allDay, true), gte(events.startDate, weekStart), lte(events.startDate, weekEnd)),
    ),
    ...buildEventFilterConditions(topics, beforeTime, afterTime, timeZone),
  ]


  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      startDate: events.startDate,
      startTime: events.startTime,
      endTime: events.endTime,
      allDay: events.allDay,
      address: events.address,
      locationName: events.locationName,
      latitude: events.latitude,
      longitude: events.longitude,
      sourceUrl: events.sourceUrl,
      imageUrl: events.imageUrl,
      thumbnailUrl: events.thumbnailUrl,
      submittedByUserId: events.submittedByUserId,
      topic: events.topic,
      interestStatus: eventInterests.status,
      interestedCount: interestedCountExpr(events.id),
      interestedPeople: interestedPeopleExpr(events.id, userId),
      submittedBy: submittedByExpr(events.submittedByUserId),
    })
    .from(events)
    .leftJoin(
      eventInterests,
      userId
        ? and(eq(eventInterests.eventId, events.id), eq(eventInterests.userId, userId), isNull(eventInterests.deletedAt))
        : sql`false`,
    )
    .where(and(...conditions))
    .orderBy(asc(sql`(CASE WHEN ${events.allDay} THEN ${events.startDate} ELSE (${events.startsAt} AT TIME ZONE ${timeZone})::date END)`), asc(sql`(CASE WHEN ${events.allDay} THEN '23:59:59'::time ELSE (${events.startsAt} AT TIME ZONE ${timeZone})::time END)`), asc(events.id))

  return rows.map((row) =>
    serializeEvent(
      row,
      row.interestStatus as InterestStatus | null,
      row.interestedCount,
      row.interestedPeople,
      currentUser,
      row.submittedBy,
    ),
  )
}
