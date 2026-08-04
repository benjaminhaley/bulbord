// Pure, dependency-free school-break/camp grouping logic — no events
// equivalent. Computed in TypeScript rather than SQL: unlike events' next-
// occurrence-collapse CTE (which has to run before LIMIT/pagination on a
// potentially large table), this has no pagination constraint — school_breaks
// is a handful of rows and camps a few dozen at most, so the caller fetches
// everything and this module does the (fiddly, worth unit-testing
// exhaustively) bucket-splitting and overlap math in plain TS.

export interface SchoolBreakRow {
  id: string
  name: string
  startDate: string // YYYY-MM-DD
  endDate: string
  splitWeekly: boolean
}

export interface BreakBucket {
  id: string // school_break id, or `${breakId}:week:${n}` for a weekly bucket
  breakId: string
  name: string
  label: string // break name, or "Week of Jun 8" for a weekly bucket
  startDate: string
  endDate: string
  isWeeklyBucket: boolean
}

function parseDateUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateUTC(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return formatDateUTC(d)
}

function weekOfLabel(dateStr: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    parseDateUTC(dateStr),
  )
  return `Week of ${formatted}`
}

// Plain YYYY-MM-DD string comparison is correct here — no Date parsing/
// timezone handling needed, same reasoning todayInChicago() relies on
// elsewhere in this codebase.
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart
}

// Splits a splitWeekly break into 7-day buckets anchored on the break's own
// start_date (not calendar Monday — the break's actual start is the natural
// anchor). The final bucket is truncated at the break's own end_date rather
// than overrunning it.
export function buildBreakBuckets(breaks: SchoolBreakRow[]): BreakBucket[] {
  const buckets: BreakBucket[] = []

  for (const schoolBreak of breaks) {
    if (!schoolBreak.splitWeekly) {
      buckets.push({
        id: schoolBreak.id,
        breakId: schoolBreak.id,
        name: schoolBreak.name,
        label: schoolBreak.name,
        startDate: schoolBreak.startDate,
        endDate: schoolBreak.endDate,
        isWeeklyBucket: false,
      })
      continue
    }

    let cursor = schoolBreak.startDate
    let weekNumber = 1
    while (cursor <= schoolBreak.endDate) {
      const naturalWeekEnd = addDays(cursor, 6)
      const bucketEnd = naturalWeekEnd > schoolBreak.endDate ? schoolBreak.endDate : naturalWeekEnd
      buckets.push({
        id: `${schoolBreak.id}:week:${weekNumber}`,
        breakId: schoolBreak.id,
        name: schoolBreak.name,
        label: weekOfLabel(cursor),
        startDate: cursor,
        endDate: bucketEnd,
        isWeeklyBucket: true,
      })
      cursor = addDays(bucketEnd, 1)
      weekNumber += 1
    }
  }

  return buckets
}

export interface CampGroup<C> {
  bucket: BreakBucket
  camps: C[]
}

// Groups camps into every break bucket their date range overlaps (a camp
// spanning several summer weeks appears under each one — confirmed with Ben
// rather than only showing it under its first week). Buckets are filtered to
// "upcoming" (bucket end_date >= today) individually, not by the parent
// break's overall end_date — a splitWeekly break's early weeks can already be
// past even while the break as a whole hasn't ended yet. Buckets with no
// matching camps are still returned (camp_count 0) so a break with nothing
// yet reads as "nothing yet," not as absent. Camps overlapping no break at
// all are collected into a trailing synthetic "Other" bucket, included only
// when non-empty, so nothing is silently dropped from view.
export function groupCampsByBreak<C extends { id: string; startDate: string; endDate: string }>(
  breaks: SchoolBreakRow[],
  camps: C[],
  today: string,
): CampGroup<C>[] {
  const buckets = buildBreakBuckets(breaks)
    .filter((bucket) => bucket.endDate >= today)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))

  const groups = buckets.map((bucket) => ({
    bucket,
    camps: camps.filter((camp) => rangesOverlap(camp.startDate, camp.endDate, bucket.startDate, bucket.endDate)),
  }))

  const matchedCampIds = new Set(groups.flatMap((group) => group.camps.map((camp) => camp.id)))
  const unmatched = camps.filter((camp) => !matchedCampIds.has(camp.id) && camp.endDate >= today)
  if (unmatched.length > 0) {
    groups.push({
      bucket: {
        id: 'other',
        breakId: 'other',
        name: 'Other',
        label: 'Other',
        startDate: '',
        endDate: '',
        isWeeklyBucket: false,
      },
      camps: unmatched,
    })
  }

  return groups
}
