// "Delete series" (feedback #185). There's no series table: a repeating
// member post is independent rows sharing a title, and a sourced series is
// whatever the weekly extraction produced — sometimes with per-date title
// suffixes ("LEAP: Learn, Explore, and Play — Wednesday Series (Oct 21)").
// A series is therefore derived: same source (or, for a member post with no
// source, same poster + source URL) and the same series key.
import { and, eq, gte, isNull, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSeriesBlocks, events } from '../db/schema.js'

// Words that mark a title suffix as describing *this date/session* rather
// than naming a different thing. "Movie Night — Frozen" keeps its suffix
// (different films are different series); "— Wednesday Series (Oct 21)"
// drops it.
const DATE_OR_SESSION_HINT =
  /\b(series|class|classes|session|sessions|week|weekly|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b|\d/i

export function seriesTitleKey(title: string): string {
  let t = title.trim()
  // Trailing parentheticals, innermost-last: "(Sat, Nov 7)".
  for (let m = t.match(/^(.*\S)\s*\(([^()]*)\)$/); m && DATE_OR_SESSION_HINT.test(m[2]); m = t.match(/^(.*\S)\s*\(([^()]*)\)$/)) {
    t = m[1]
  }
  // One spaced-dash suffix: "— Wednesday Series", "- Stand-alone Class".
  const dash = t.match(/^(.*?\S)\s+[—–-]\s+(.+)$/)
  if (dash && DATE_OR_SESSION_HINT.test(dash[2])) t = dash[1]
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface SeriesEvent {
  id: string
  title: string
  startDate: string
  startsAt: Date
  allDay: boolean
  submittedByUserId: string | null
}

// This event and every later live one in its series, earliest first.
export async function findUpcomingSeries(eventId: string): Promise<SeriesEvent[]> {
  const [anchor] = await db
    .select({
      title: events.title,
      startDate: events.startDate,
      sourceId: events.sourceId,
      sourceUrl: events.sourceUrl,
      submittedByUserId: events.submittedByUserId,
    })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!anchor) return []

  const sameOrigin = anchor.sourceId
    ? eq(events.sourceId, anchor.sourceId)
    : and(
        isNull(events.sourceId),
        sql`${events.submittedByUserId} is not distinct from ${anchor.submittedByUserId}`,
        sql`${events.sourceUrl} is not distinct from ${anchor.sourceUrl}`,
      )
  const rows = await db
    .select({ id: events.id, title: events.title, startDate: events.startDate, startsAt: events.startsAt, allDay: events.allDay, submittedByUserId: events.submittedByUserId })
    .from(events)
    .where(and(sameOrigin, isNull(events.deletedAt), gte(events.startDate, anchor.startDate)))
    .orderBy(events.startsAt)

  const key = seriesTitleKey(anchor.title)
  return rows.filter((r) => seriesTitleKey(r.title) === key)
}

export async function blockSeries(sourceId: string, title: string, userId: string) {
  await db.insert(eventSeriesBlocks).values({ sourceId, titleKey: seriesTitleKey(title), exampleTitle: title, blockedByUserId: userId })
}

// Series keys a source must no longer ingest.
export async function blockedSeriesKeys(sourceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ titleKey: eventSeriesBlocks.titleKey })
    .from(eventSeriesBlocks)
    .where(and(eq(eventSeriesBlocks.sourceId, sourceId), isNull(eventSeriesBlocks.deletedAt)))
  return new Set(rows.map((r) => r.titleKey))
}
