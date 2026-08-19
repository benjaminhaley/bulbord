// Pure, client-side filter predicates for the Sports & Clubs list (feedback,
// 2026-08-19: "filter here, which allows you to filter by topic. And
// schedule..."). Purely client-side, unlike Events' server-side topic/hours
// filters — GET /sports-clubs already returns the full relevant set (no
// pagination pressure, same reasoning sorting.ts/grouping-by-category give
// for keeping this logic in TS rather than adding query params), so there's
// no round-trip needed to apply either filter. Own file, not format.ts,
// since filtering (which rows survive) is a different concern from
// formatting (how a surviving row's text reads).
import { matchesAgeFilter } from '../gradeAges'
import type { SportsClubOccurrence } from './api'

export type ScheduleDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface AgeFilterable {
  age_min: number | null
  age_max: number | null
}

// Feedback #103 (2026-08-19) — matchesAgeFilter itself is genuinely shared
// with Camps (see ../gradeAges.ts), this thin wrapper just keeps the
// SportsClub-typed call site consistent with matchesCategoryFilter/
// matchesScheduleFilter below.
export function matchesSportsClubAgeFilter(club: AgeFilterable, selectedAges: number[]): boolean {
  return matchesAgeFilter(club.age_min, club.age_max, selectedAges)
}

export const DAY_OPTIONS: { value: ScheduleDay; label: string }[] = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export type TimeOfDayBucket = 'morning' | 'afternoon' | 'evening'

// Boundaries: before noon is morning, noon–5pm is afternoon, 5pm on is
// evening. A coarser three-bucket picker, deliberately different from
// Events' own continuous dual-knob Hours range (CLAUDE.md) — feedback,
// 2026-08-19, asked directly for "time of day... chunked up into, say,
// morning, afternoon, evening," not a slider, so this is an intentional
// divergence rather than a step toward matching Events.
export const TIME_OF_DAY_OPTIONS: { value: TimeOfDayBucket; label: string }[] = [
  { value: 'morning', label: 'Morning (before 12pm)' },
  { value: 'afternoon', label: 'Afternoon (12 – 5pm)' },
  { value: 'evening', label: 'Evening (after 5pm)' },
]

export function timeOfDayBucket(time: string): TimeOfDayBucket {
  const hour = Number(time.split(':')[0])
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export interface CategoryFilterable {
  category: string | null
}

// A club with no real category (shouldn't happen for a real listing — see
// SportsClubsPage.tsx's own FALLBACK_CATEGORY doc comment) falls into the
// same "Other" bucket the accordion grouping uses, kept in sync as the same
// literal rather than imported — importing a page component's own local
// constant into this pure, page-agnostic module would invert the natural
// dependency direction.
const FALLBACK_CATEGORY = 'Other'

// Empty selection = "everything" — same default-shows-all convention as
// Events' own Topic filter.
export function matchesCategoryFilter(club: CategoryFilterable, selected: string[]): boolean {
  if (selected.length === 0) return true
  return selected.includes(club.category ?? FALLBACK_CATEGORY)
}

export interface ScheduleFilterable {
  occurrences: SportsClubOccurrence[]
}

// Checks the club's real occurrence set, not just its single soonest one
// (feedback #107's split surfaced a real case this needs to handle: a class
// that genuinely meets on two different weekdays each week — e.g. "Beginner
// (Mon & Wed)" — still needs to match a Wednesday filter even when the
// chronologically-next occurrence happens to fall on Monday). Feedback #106
// (2026-08-19), from a live screenshot: a member filtered for Friday
// morning and still saw a listing with no known schedule at all ("Schedule
// not specified") — "anything without a schedule should automatically be
// eliminated." This reverses the original "never hide what we don't have
// real data for" posture (Events' Hours filter keeps that posture — see
// CLAUDE.md — since this is a deliberate, narrower divergence, not a step
// toward matching it): a club with no occurrence data, or none whose known
// day/time satisfies an active filter, can never be shown to satisfy a
// specific day/time the member asked for, so it's excluded rather than
// shown on a guess.
export function matchesScheduleFilter(club: ScheduleFilterable, days: ScheduleDay[], times: TimeOfDayBucket[]): boolean {
  if (days.length === 0 && times.length === 0) return true
  if (club.occurrences.length === 0) return false
  const dayMatches =
    days.length === 0
      ? club.occurrences
      : club.occurrences.filter((o) => days.includes(new Date(`${o.date}T00:00:00`).getDay() as ScheduleDay))
  if (dayMatches.length === 0) return false
  if (times.length === 0) return true
  return dayMatches.some((o) => o.start_time != null && times.includes(timeOfDayBucket(o.start_time)))
}
