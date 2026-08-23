import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventInterests } from '../db/schema.js'
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
  userId: string | null,
) {
  const weekEnd = toISODate(addDays(parseISODate(weekStart), 6))

  const conditions = [
    eq(events.status, 'approved'),
    isNull(events.deletedAt),
    gte(events.startDate, weekStart),
    lte(events.startDate, weekEnd),
    ...buildEventFilterConditions(topics, beforeTime, afterTime),
  ]

  const sortTimeExpr = sql`coalesce(${events.startTime}, '23:59:59'::time)`

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
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
    .orderBy(asc(events.startDate), asc(sortTimeExpr), asc(events.id))

  return rows.map((row) =>
    serializeEvent(
      row,
      row.interestStatus as InterestStatus | null,
      row.interestedCount,
      row.interestedPeople,
      userId,
      row.submittedBy,
    ),
  )
}
