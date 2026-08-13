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

// Feedback #74: an event within the current week (2-6 days out) reads as
// "This Saturday" rather than a bare date — capitalized like "Today"/
// "Tomorrow" above, since it's always the leading word of the line, never
// mid-sentence. Day 7 (a week from today) falls back to the full date
// instead, since people usually mean "next <Weekday>" at that distance, not
// "this <Weekday>".
function relativeDayLabel(date: Date, today: Date): string | null {
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round((date.getTime() - today.getTime()) / dayMs)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays >= 2 && diffDays <= 6) return `This ${date.toLocaleDateString('en-US', { weekday: 'long' })}`
  return null
}

// House time-formatting style (feedback, 2026-08-05, originally established
// for Camps — camps/format.ts's identical parseTime/formatSingleTime —
// ported here 2026-08-13 per the style-audit pass, feedback #70): omit
// minutes entirely when they're :00 ("9 am", not "9:00 am"); lowercase
// am/pm with no periods; "noon"/"midnight" instead of "12 pm"/"12 am".
// Events only ever show a single start time (no end time in this data
// model — see FormattableEvent below), so the range-specific "shared
// meridiem shown once" rule from Camps' formatTimeRange doesn't apply here.
function formatTime(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const isPM = hour >= 12
  if (hour12 === 12 && minute === 0) return isPM ? 'noon' : 'midnight'
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour12}${minutePart}${isPM ? ' pm' : ' am'}`
}

export interface FormattableEvent {
  startDate: string
  startTime: string | null
  allDay: boolean
}

export function formatWhen(event: FormattableEvent, now = new Date()): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const date = new Date(`${event.startDate}T00:00:00`)
  const dateLabel =
    relativeDayLabel(date, today) ?? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (event.allDay || !event.startTime) return dateLabel

  return `${dateLabel} · ${formatTime(event.startTime)}`
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
