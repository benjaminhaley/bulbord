import { CHICAGO_TIME_ZONE, instantToWallClock, wallClockToInstantMs } from './timezone-core.js'

// The stored shape for anything that happens at a point in time (events,
// sports-club occurrences): real UTC instants, plus all_day for a date-only
// entry (stored as Chicago midnight of its date). See timezone-core.ts.
export interface Times {
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
}

// Chicago wall-clock in -> stored instants out. Every internal producer of
// an event/occurrence (LLM extraction, seed scripts, the legacy wall-clock
// request fields) speaks Chicago local time, so they all convert here.
export function timesFromChicagoWallClock(input: {
  date: string
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
}): Times {
  const allDay = Boolean(input.allDay) || !input.startTime
  if (allDay) {
    return { startsAt: new Date(wallClockToInstantMs(input.date, '00:00:00')), endsAt: null, allDay: true }
  }
  return {
    startsAt: new Date(wallClockToInstantMs(input.date, input.startTime as string)),
    endsAt: input.endTime ? new Date(wallClockToInstantMs(input.date, input.endTime)) : null,
    allDay: false,
  }
}

// The Chicago calendar date + clock times an instant reads as (what the
// generated start_date/start_time/end_time columns hold).
export function chicagoWallClock(instant: Date): { date: string; time: string } {
  return instantToWallClock(instant.getTime(), CHICAGO_TIME_ZONE)
}

// Request-body times: real instants preferred (`starts_at`/`ends_at`, what
// the app sends from the viewer's own zone), falling back to Chicago
// wall-clock fields for older clients / restoring a legacy history snapshot.
export interface TimeFields {
  starts_at?: string | null
  ends_at?: string | null
  start_date?: string | null
  start_time?: string | null
  end_time?: string | null
  all_day?: boolean
}

export function timesFromFields(fields: TimeFields): Times | null {
  if (fields.starts_at) {
    const startsAt = new Date(fields.starts_at)
    if (Number.isNaN(startsAt.getTime())) return null
    if (fields.all_day) {
      // Date-only: the Chicago calendar date of the instant, at midnight.
      return timesFromChicagoWallClock({ date: chicagoWallClock(startsAt).date, allDay: true })
    }
    const endsAt = fields.ends_at ? new Date(fields.ends_at) : null
    if (endsAt && Number.isNaN(endsAt.getTime())) return null
    return { startsAt, endsAt, allDay: false }
  }
  if (!fields.start_date) return null
  return timesFromChicagoWallClock({
    date: fields.start_date,
    startTime: fields.start_time,
    endTime: fields.end_time,
    allDay: fields.all_day,
  })
}
