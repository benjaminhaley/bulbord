import { inArray, sql, type SQL } from 'drizzle-orm'

import { events } from '../db/schema.js'
import { CHICAGO_TIME_ZONE } from '../timezone-core.js'

// Shared by GET /events and GET /events/week (feedback #97) — both need the
// same topic/time-of-day filtering, just applied to a different date range.
// No server-side allowlist against web/src/events/topics.ts's fixed list:
// topic is a plain, unvalidated text column (same posture as users.role),
// and a filter for a topic value nobody happens to have used yet is simply
// a filter that matches nothing, not an error.
export function parseTopicsParam(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

// 'HH:MM' — validated loosely (must parse as a real time-of-day) since it
// only ever narrows a WHERE clause, never gets stored. Shared by both ends
// of the hours range below (feedback, 2026-08-17: "closer to [Google Maps'
// Price per person]... you can set range").
function parseTimeParam(raw: string | undefined): string | null {
  if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return null
  return `${raw}:00`
}

export function parseAfterTimeParam(raw: string | undefined): string | null {
  return parseTimeParam(raw)
}

export function parseBeforeTimeParam(raw: string | undefined): string | null {
  return parseTimeParam(raw)
}

// The viewer's IANA zone (`tz` query param) — hours-of-day filters and the
// week's day boundaries are read in it, since a 5pm cutoff means the
// viewer's 5pm. Anything unparseable falls back to Chicago.
export function parseTimeZoneParam(raw: string | undefined): string {
  if (!raw) return CHICAGO_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return raw
  } catch {
    return CHICAGO_TIME_ZONE
  }
}

// Topic: only applied when at least one topic was requested (an event with
// no topic set is excluded once any filter is active — there's nothing to
// match). Hours range: "only show events starting between HH:MM and HH:MM" —
// an all-day or no-specific-time event isn't affected by either end, since
// neither represents a genuine time-of-day commitment the filter is meant
// to screen by.
export function buildEventFilterConditions(
  topics: string[],
  beforeTime: string | null,
  afterTime: string | null,
  timeZone: string = CHICAGO_TIME_ZONE,
): SQL[] {
  const conditions: SQL[] = []
  if (topics.length > 0) {
    conditions.push(inArray(events.topic, topics))
  }
  // Time-of-day in the viewer's zone, from the real instant.
  const localTime = sql`((${events.startsAt} AT TIME ZONE ${timeZone})::time)`
  if (afterTime) {
    conditions.push(sql`(${events.allDay} OR ${localTime} >= ${afterTime}::time)`)
  }
  if (beforeTime) {
    conditions.push(sql`(${events.allDay} OR ${localTime} <= ${beforeTime}::time)`)
  }
  return conditions
}
