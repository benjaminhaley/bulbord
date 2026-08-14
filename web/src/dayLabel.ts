// Shared "what day is this" formatting — used by both web/src/events/format.ts
// and web/src/camps/format.ts (previously two independently-diverging
// Today/Tomorrow/"This <Weekday>" implementations; see feedback #78) since
// both need the exact same day-labeling rules despite being otherwise
// non-shared clones (see CLAUDE.md's Camps section) — this is "truly
// generic shared infra," the same bar auth/uploads/dates.ts(api)/Avatar
// already clear.
//
// Two display modes (confirmed with Ben, 2026-08-14): 'summary' (a list
// row, where a Today/Tomorrow/"This Saturday" word is enough, since the
// row's own section/bucket header usually supplies more date context) and
// 'detailed' (a detail page reached via its own URL, with no such
// surrounding context) shows the word AND the actual date together, e.g.
// "This Saturday, Aug 16" — so a page opened directly (a shared link, a
// bookmark) is never ambiguous about which day it actually describes.
//
// Mirrored byte-for-byte into api/src/dayLabel.ts (parity-checked by
// scripts/check-format-parity.mjs, same convention as events/format.ts's
// own newsletter mirror) since the newsletter's own formatWhen needs the
// identical relativeDayLabel rule — even though the newsletter itself only
// ever uses 'summary' mode today, the rule for *which* days get "This
// <Weekday>" must never drift between the two. Lives at api/src/ (a
// sibling of the pre-existing, unrelated api/src/dates.ts Chicago-timezone
// helper — different file, deliberately not reused/merged with it) so its
// relative import path from api/src/newsletter/format.ts ('../dayLabel')
// matches this file's own relative path from web/src/events/format.ts
// after the parity check's .js-extension normalization — see that script's
// own comment.

const DAY_MS = 24 * 60 * 60 * 1000

function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

// "This <Weekday>" only within the current Sunday-Saturday calendar week
// (confirmed with Ben, 2026-08-14, replacing an earlier fixed "2-6 days
// out" heuristic that ignored week boundaries entirely — e.g. it used to
// call a Sunday two days after a Friday "This Sunday" even though that
// Sunday starts next week).
function relativeDayLabel(date: Date, today: Date): string | null {
  const diffDays = Math.round((date.getTime() - today.getTime()) / DAY_MS)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 2) return null
  if (startOfWeek(date).getTime() !== startOfWeek(today).getTime()) return null
  return `This ${date.toLocaleDateString('en-US', { weekday: 'long' })}`
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// No weekday here, unlike shortDate above — this is only ever appended
// right after a relative word that already names the weekday itself
// ("This Saturday", "Today"), so repeating it ("This Saturday, Sat, Aug 8")
// would be redundant. shortDate's weekday-inclusive form is still what's
// used standalone (see dayLabel below), when there's no relative word to
// carry that information.
function monthDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export type DayLabelMode = 'summary' | 'detailed'

// dateStr is a plain YYYY-MM-DD (an event/camp's start_date) so it's parsed
// as local midnight rather than UTC midnight, same as every other date
// parse in this codebase.
export function dayLabel(dateStr: string, now: Date, mode: DayLabelMode = 'summary'): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const date = new Date(`${dateStr}T00:00:00`)
  const relative = relativeDayLabel(date, today)
  if (relative == null) return shortDate(date)
  return mode === 'detailed' ? `${relative}, ${monthDay(date)}` : relative
}
