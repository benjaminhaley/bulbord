// Feedback #173: a member can post a repeating event. Recurrence is expanded
// into ordinary, independent `events` rows (one per date) at post time — the
// same many-rows-sharing-one-source_url shape Bike Bus already uses — so
// nothing downstream (list collapse, week view, newsletter) needs to know a
// series exists.
//
// Cap: at most MAX_OCCURRENCES events (the first one included) and none more
// than one year after the first date, whichever ends up shorter.

export const RECURRENCE_PATTERNS = ['weekly', 'biweekly', 'monthly_nth', 'monthly_last'] as const
export type RecurrencePattern = (typeof RECURRENCE_PATTERNS)[number]

export const MAX_OCCURRENCES = 20

export function isRecurrencePattern(value: unknown): value is RecurrencePattern {
  return typeof value === 'string' && (RECURRENCE_PATTERNS as readonly string[]).includes(value)
}

// Plain calendar math in UTC — every date in this app is a timezone-less
// YYYY-MM-DD, so UTC is only a stable arithmetic frame, never a real zone.
function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/** 1-based ordinal of this date's weekday within its month (1st Sunday = 1). */
export function weekdayOrdinal(date: string): number {
  return Math.floor((parse(date).getUTCDate() - 1) / 7) + 1
}

/** True when no later date in the same month shares this date's weekday. */
export function isLastWeekdayOfMonth(date: string): boolean {
  return addDays(parse(date), 7).getUTCMonth() !== parse(date).getUTCMonth()
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date | null {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7
  const candidate = new Date(Date.UTC(year, month, day))
  return candidate.getUTCMonth() === ((month % 12) + 12) % 12 ? candidate : null
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0))
  return addDays(lastOfMonth, -((lastOfMonth.getUTCDay() - weekday + 7) % 7))
}

/**
 * Every date of the series, starting with `startDate` itself. Monthly
 * patterns keep the start date's weekday: `monthly_nth` uses its ordinal
 * (2nd Tuesday → every 2nd Tuesday, skipping a month that lacks one),
 * `monthly_last` always uses the month's final such weekday.
 */
export function expandRecurrence(startDate: string, pattern: RecurrencePattern): string[] {
  const start = parse(startDate)
  const limit = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()))
  const dates: string[] = [startDate]

  if (pattern === 'weekly' || pattern === 'biweekly') {
    const step = pattern === 'weekly' ? 7 : 14
    for (let next = addDays(start, step); dates.length < MAX_OCCURRENCES && next <= limit; next = addDays(next, step)) {
      dates.push(format(next))
    }
    return dates
  }

  const weekday = start.getUTCDay()
  const ordinal = weekdayOrdinal(startDate)
  for (let offset = 1; dates.length < MAX_OCCURRENCES; offset++) {
    const year = start.getUTCFullYear()
    const month = start.getUTCMonth() + offset
    const next =
      pattern === 'monthly_last'
        ? lastWeekdayOfMonth(year, month, weekday)
        : nthWeekdayOfMonth(year, month, weekday, ordinal)
    if (next && next > limit) break
    // Date.UTC normalizes month overflow, so an ordinal-5 miss (null) just
    // skips that month; stop once we're past the limit either way.
    if (!next) {
      if (new Date(Date.UTC(year, month, 1)) > limit) break
      continue
    }
    dates.push(format(next))
  }
  return dates
}

// Shared by photo-extraction.ts's and description-extraction.ts's stage-1
// prompts so both on-ramps propose recurrence the same way.
export const RECURRENCE_PROMPT_RULE = `- recurrence: only when the source explicitly states the event repeats on a regular schedule, set it to exactly one of: "weekly" (every week), "biweekly" (every other week), "monthly_nth" (a specific ordinal weekday each month, e.g. "2nd Tuesday of each month" — the ordinal is taken from start_date), "monthly_last" (the last such weekday each month, e.g. "last Sunday of each month"). Otherwise omit it entirely — never infer repetition from a single dated event. When recurrence is set, start_date must be the soonest real date on or after today that actually fits the stated pattern (e.g. the next last-Sunday), not just any date.`

export function parseRecurrence(value: unknown): RecurrencePattern | undefined {
  return isRecurrencePattern(value) ? value : undefined
}
