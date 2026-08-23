// Pure event-formatting helpers — deliberately kept byte-identical between
// web/src/events/format.ts and api/src/newsletter/format.ts. There's no real
// shared package between web/ and api/ (each is deployed independently via
// `railway up --path-as-root`, which uploads only that service's own
// directory — see CLAUDE.md's Application architecture — so a runtime
// cross-package import wouldn't exist at deploy time), so "identical" is
// enforced by scripts/check-format-parity.mjs (run in CI) rather than by a
// real import. If you change one of these files, make the same change to
// the other, or the parity check will fail the build. This replaced a
// looser, naming-mismatched duplicate (feedback #36 — the newsletter had
// drifted to inventing its own colors and had a different parameter shape
// from this file).
//
// Feedback #74/#78: an event within the current Sunday-Saturday calendar
// week reads as "This Saturday" rather than a bare date — capitalized like
// "Today"/"Tomorrow", since it's always the leading word of the line, never
// mid-sentence. A day outside the current week (even if only 2-6 days out —
// e.g. a Sunday two days after a Friday, which starts next week) falls back
// to the full date instead, since "this <Weekday>" would misdescribe a day
// that isn't actually in this week. This day-labeling rule (and its
// 'summary'/'detailed' modes — see formatWhen below) lives in ../dates.ts,
// shared with camps/format.ts (see that file's header comment) and
// mirrored byte-for-byte into api/src/newsletter/dates.ts.
import { dayLabel, type DayLabelMode } from '../dayLabel.js'

// House time-formatting style (feedback, 2026-08-05, originally established
// for Camps — camps/format.ts's identical parseTime/formatSingleTime —
// ported here 2026-08-13 per the style-audit pass, feedback #70): omit
// minutes entirely when they're :00 ("9 am", not "9:00 am"); lowercase
// am/pm with no periods; "noon"/"midnight" instead of "12 pm"/"12 am"; am/pm
// shown on both ends of a range only when they actually differ (feedback,
// 2026-08-23, adding a real end_time to events — same "shared meridiem
// shown once" rule Camps' formatTimeRange already established, ported
// here now that events have a range to format too).
interface TimeParts {
  hour12: number
  minute: number
  isPM: boolean
}

function parseTime(time: string): TimeParts {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return { hour12, minute: Number(minuteStr), isPM: hour >= 12 }
}

function formatSingleTime(time: string, showMeridiem: boolean): string {
  const { hour12, minute, isPM } = parseTime(time)
  if (hour12 === 12 && minute === 0) return isPM ? 'noon' : 'midnight'
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  const meridiemPart = showMeridiem ? (isPM ? ' pm' : ' am') : ''
  return `${hour12}${minutePart}${meridiemPart}`
}

function formatTimeRange(startTime: string, endTime: string | null): string {
  if (!endTime) return formatSingleTime(startTime, true)
  const sameMeridiem = parseTime(startTime).isPM === parseTime(endTime).isPM
  return `${formatSingleTime(startTime, !sameMeridiem)} – ${formatSingleTime(endTime, true)}`
}

export interface FormattableEvent {
  startDate: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
}

// mode defaults to 'summary' (the existing word-only behavior every current
// call site relies on) — pass 'detailed' from a detail page, reached via
// its own URL with no surrounding list/section context, to also show the
// actual date alongside the word (e.g. "This Saturday, Aug 16").
export function formatWhen(event: FormattableEvent, now = new Date(), mode: DayLabelMode = 'summary'): string {
  const label = dayLabel(event.startDate, now, mode)
  if (event.allDay || !event.startTime) return label
  return `${label} · ${formatTimeRange(event.startTime, event.endTime)}`
}

// Addresses are typically stored as "Street, Chicago, IL 60613" — everything
// in this app is Chicago-area, so the city/state/zip is redundant noise in
// the abbreviated list view. Addresses come from unstructured scraping (see
// api/src/events/ingest.ts) with no guaranteed shape, so only strip the
// suffix when it actually matches "City, ST ZIP" — otherwise show the
// address as-is rather than risk mangling a format we didn't anticipate.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export interface LocatableEvent {
  locationName: string | null
  address: string | null
}

export function locationLabel(event: LocatableEvent): string | null {
  if (event.locationName) return event.locationName
  return event.address ? event.address.replace(CITY_STATE_ZIP, '').trim() : null
}

export function teaser(description: string | null, maxLength = 90): string | null {
  if (!description) return null
  if (description.length <= maxLength) return description
  return `${description.slice(0, maxLength).trimEnd()}…`
}

function joinWithAnd(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const INTERESTED_TEASER_MAX_CHARS = 30

// Leads with the count (so "1 interested: You" reads as a count followed by
// who, not a sentence with "You" as its subject), then as many actual names
// as fit within the character budget, trailing off with "…" if it doesn't
// all fit — never returns an empty name list since count > 0 here.
export function buildInterestedTeaser(names: string[], totalCount: number, maxChars = INTERESTED_TEASER_MAX_CHARS): string {
  for (let shown = names.length; shown >= 1; shown--) {
    const truncated = shown < names.length
    const text = truncated ? `${names.slice(0, shown).join(', ')}…` : joinWithAnd(names.slice(0, shown))
    if (text.length <= maxChars || shown === 1) return `${totalCount} interested: ${text}`
  }
  return `${totalCount} interested`
}
