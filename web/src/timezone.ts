// The database stores every point in time as a real UTC instant (see
// timezone-core.ts and CLAUDE.md, "Time zones"): the API sends `starts_at`/
// `ends_at` ISO strings, and everything here renders them in the viewer's own
// zone and turns viewer-entered date/time back into instants on save.
// Chicago-viewing members see no change from before.
import { CHICAGO_TIME_ZONE, instantToWallClock, wallClockToInstantMs } from './timezone-core'

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export interface LocalTiming {
  // The calendar date to show: the viewer-local date for a timed entry, the
  // stored calendar date for an all-day one (which has no clock to shift).
  date: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
}

// Anything with a point in time: the real instants when the API sent them
// (`starts_at`/`ends_at`), else Chicago wall-clock fields (older edit-history
// snapshots, admin candidate data) treated as America/Chicago.
export interface TimedThing {
  starts_at?: string | null
  ends_at?: string | null
  start_date: string
  start_time: string | null
  end_time?: string | null
  all_day: boolean
}

export function localTiming(thing: TimedThing, timeZone?: string): LocalTiming {
  if (thing.all_day || (!thing.starts_at && !thing.start_time)) {
    return { date: thing.start_date, startTime: null, endTime: null, allDay: true }
  }
  const startMs = thing.starts_at ? Date.parse(thing.starts_at) : wallClockToInstantMs(thing.start_date, thing.start_time as string)
  const endMs = thing.ends_at ? Date.parse(thing.ends_at) : thing.end_time ? wallClockToInstantMs(thing.start_date, thing.end_time) : null
  const start = instantToWallClock(startMs, timeZone)
  return { date: start.date, startTime: start.time, endTime: endMs === null ? null : instantToWallClock(endMs, timeZone).time, allDay: false }
}

// A Chicago wall-clock date/time (what LLM extraction and other Chicago-local
// producers speak) as the viewer's local date/time, for prefilling a form.
export function chicagoWallClockToLocal(date: string, time: string | null | undefined, timeZone?: string): { date: string; time: string | null } {
  if (!date || !time) return { date, time: time || null }
  const local = instantToWallClock(wallClockToInstantMs(date, time, CHICAGO_TIME_ZONE), timeZone)
  return { date: local.date, time: local.time.slice(0, 5) }
}

// Viewer-entered local date + time -> the ISO instant the API stores.
export function localToInstantIso(date: string, time: string, timeZone: string = viewerTimeZone()): string {
  return new Date(wallClockToInstantMs(date, time.length === 5 ? `${time}:00` : time, timeZone)).toISOString()
}

// A camp's daily hours are wall-clock in the camp's own zone (a multi-day camp
// repeats them each day); this shows them in the viewer's zone, against the
// camp's first day so the right DST offset applies.
export function localizeWallClock(
  date: string,
  startTime: string | null,
  endTime: string | null,
  sourceTimeZone: string = CHICAGO_TIME_ZONE,
  viewerZone?: string,
): { date: string; startTime: string | null; endTime: string | null } {
  if (!startTime) return { date, startTime: null, endTime: null }
  const start = instantToWallClock(wallClockToInstantMs(date, startTime, sourceTimeZone), viewerZone)
  const end = endTime ? instantToWallClock(wallClockToInstantMs(date, endTime, sourceTimeZone), viewerZone).time : null
  return { date: start.date, startTime: start.time, endTime: end }
}

// Event-shaped convenience for format.ts's formatWhen (kept free of any
// timezone knowledge itself — it's byte-mirrored into the server-side
// newsletter, which is deliberately Chicago-only).
export function localEventTiming(
  thing: TimedThing,
  timeZone?: string,
): { startDate: string; startTime: string | null; endTime: string | null; allDay: boolean } {
  const t = localTiming(thing, timeZone)
  return { startDate: t.date, startTime: t.startTime, endTime: t.endTime, allDay: t.allDay }
}

// The real instants of a timed thing (null for an all-day / no-time one),
// for calendar exports.
export function instantsOf(thing: TimedThing): { startsAt: Date | null; endsAt: Date | null } {
  if (thing.all_day || (!thing.starts_at && !thing.start_time)) return { startsAt: null, endsAt: null }
  const startMs = thing.starts_at ? Date.parse(thing.starts_at) : wallClockToInstantMs(thing.start_date, thing.start_time as string)
  const endMs = thing.ends_at ? Date.parse(thing.ends_at) : thing.end_time ? wallClockToInstantMs(thing.start_date, thing.end_time) : null
  return { startsAt: new Date(startMs), endsAt: endMs === null ? null : new Date(endMs) }
}

// A camp's daily hours on one date, in the camp's own zone, as real instants.
export function wallClockInstants(
  date: string,
  startTime: string | null,
  endTime: string | null,
  timeZone: string = CHICAGO_TIME_ZONE,
): { startsAt: Date | null; endsAt: Date | null } {
  if (!startTime) return { startsAt: null, endsAt: null }
  return {
    startsAt: new Date(wallClockToInstantMs(date, startTime, timeZone)),
    endsAt: endTime ? new Date(wallClockToInstantMs(date, endTime, timeZone)) : null,
  }
}
