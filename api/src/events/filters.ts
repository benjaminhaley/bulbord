import { eq, inArray, isNull, lte, or, type SQL } from 'drizzle-orm'

import { events } from '../db/schema.js'

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
// only ever narrows a WHERE clause, never gets stored.
export function parseBeforeTimeParam(raw: string | undefined): string | null {
  if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return null
  return `${raw}:00`
}

// Topic: only applied when at least one topic was requested (an event with
// no topic set is excluded once any filter is active — there's nothing to
// match). Time cutoff: "hide anything starting after HH:MM" — an all-day or
// no-specific-time event isn't affected, since neither represents a genuine
// late-in-the-day commitment the filter is meant to screen out.
export function buildEventFilterConditions(topics: string[], beforeTime: string | null): SQL[] {
  const conditions: SQL[] = []
  if (topics.length > 0) {
    conditions.push(inArray(events.topic, topics))
  }
  if (beforeTime) {
    conditions.push(or(isNull(events.startTime), eq(events.allDay, true), lte(events.startTime, beforeTime))!)
  }
  return conditions
}
