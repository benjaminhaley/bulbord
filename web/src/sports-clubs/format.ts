// Pure sports-club-formatting helpers — own copy, deliberately not shared
// with web/src/events/format.ts or web/src/camps/format.ts (Sports & Clubs
// is a fresh, non-shared clone — see CLAUDE.md). The single-day date-
// labeling rule (Today/Tomorrow/"This <Weekday>") is genuinely shared
// infra, same as it is for camps/events, so it comes from ../dayLabel
// rather than a third diverging copy.
import { dayLabel } from '../dayLabel'
import type { ScheduleType, SportsClubOccurrence } from './api'

export const CATEGORY_OPTIONS = [
  'Dance',
  'Sports & Athletics',
  'Martial Arts',
  'Music',
  'Art & Creative',
  'Academic & Clubs',
  'Other',
]

// Feedback (2026-08-19): "make sure all topics have a relevant emoji or a
// unicode icon... doesn't have to be very showy just something that
// visually represents them well." Plain emoji characters prepended to the
// label text, not IonIcon SVGs — a deliberate, explicit ask, and simpler:
// no icon asset/component needed anywhere a bare category string is shown
// (the accordion headers, the Topic filter checkboxes, the post form's
// category picker). Kept as a Record (not folded into CATEGORY_OPTIONS
// itself) since CATEGORY_OPTIONS is also the real, stored value written to
// sports_clubs.category — every existing caller that needs the plain string
// (grouping, filtering, the DB write) keeps working unchanged.
const CATEGORY_ICONS: Record<string, string> = {
  Dance: '💃',
  'Sports & Athletics': '🏃',
  'Martial Arts': '🥋',
  Music: '🎵',
  'Art & Creative': '🎨',
  'Academic & Clubs': '📚',
  Other: '🔹',
}

export function categoryLabel(category: string): string {
  const icon = CATEGORY_ICONS[category]
  return icon ? `${icon} ${category}` : category
}

function shortDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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

// House time-formatting style (STYLE_GUIDE.md / CLAUDE.md's Time formatting
// house style bullet) — no :00 minutes, lowercase am/pm, noon/midnight,
// shared meridiem shown once on a same-side range.
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

// One occurrence's date + (optional) time, for the detail page's upcoming-
// dates list. Deliberately does NOT use dayLabel()'s relative Today/
// Tomorrow/"This <Weekday>" wording, or its abbreviated-weekday fallback for
// farther-out dates (feedback, 2026-08-18, from a live screenshot: mixing
// "Today"/"This Thursday" with "Tue, Aug 25" across several rows of the same
// list read as inconsistent). A single date shown alone — scheduleSummary
// below, or any other one-date fact line elsewhere in this app — still
// benefits from the relative wording, since there's no neighboring date to
// compare it against; that's a different content shape, not the same
// inconsistency (see CLAUDE.md's intentionality principle). This is
// specific to a multi-row list, where every row needs to read as the same
// kind of fact: full weekday name, month, and day, every time.
export function occurrenceLabel(occurrence: SportsClubOccurrence): string {
  const weekdayDate = new Date(`${occurrence.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  if (!occurrence.start_time) return weekdayDate
  return `${weekdayDate} · ${formatTimeRange(occurrence.start_time, occurrence.end_time)}`
}

const RECURRING_WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

// The recurring day-of-week + time a listing actually meets on (feedback,
// 2026-08-18: "show day and time of day on the preview") — e.g.
// "Thursdays, 4:45 – 5:45 pm". Derived from the listing's own real next
// occurrence (the list fetch already includes a short preview of upcoming
// occurrences — see api/src/sports-clubs/routes.ts's
// LIST_OCCURRENCE_PREVIEW_LIMIT), not a free-text field — real, verified
// data, and it works the same way for every listing regardless of whether
// its cadence_note happens to mention a day/time in plain English.
// Pluralized ("Thursdays", not "Thursday") since this describes the
// recurring pattern, not that one specific date — unlike occurrenceLabel
// above, which is listing one real date among several in a list of actual
// dates. Returns null when no occurrence data exists yet (a real cadence
// with no confirmed day/time to generate occurrences from — see
// sorting.ts) so the caller can fall back to cadence_note instead.
export function nextOccurrenceDayTimeLabel(occurrences: SportsClubOccurrence[]): string | null {
  const next = occurrences[0]
  if (!next) return null
  const weekday = RECURRING_WEEKDAY_NAMES[new Date(`${next.date}T00:00:00`).getDay()]
  if (!next.start_time) return weekday
  return `${weekday}, ${formatTimeRange(next.start_time, next.end_time)}`
}

// A fixed_session's own first/last day, or "Ongoing — join anytime" for a
// standing club with no cohort to be late for (see api/src/sports-clubs/
// sorting.ts's doc comment for the full rationale behind this distinction).
export function scheduleSummary(
  club: { schedule_type: ScheduleType; first_date: string | null; last_date: string | null },
  now = new Date(),
): string {
  if (club.schedule_type === 'ongoing') return 'Ongoing — join anytime'
  if (club.first_date && club.last_date) {
    if (club.first_date === club.last_date) return dayLabel(club.first_date, now, 'detailed')
    return `${shortDateLabel(club.first_date)} – ${shortDateLabel(club.last_date)}`
  }
  if (club.first_date) return `Starts ${shortDateLabel(club.first_date)}`
  if (club.last_date) return `Through ${shortDateLabel(club.last_date)}`
  return 'Schedule not specified'
}

// Every one of these always returns a labeled string, never null/empty —
// same "always show the field, explicitly mark unknown" house style Camps
// established (CLAUDE.md's "no redundant display"/always-labeled bullets).
export function ageRangeLabel(ageMin: number | null, ageMax: number | null): string {
  if (ageMin == null && ageMax == null) return 'Ages: not specified'
  if (ageMin != null && ageMax != null) return ageMin === ageMax ? `Ages: ${ageMin}` : `Ages: ${ageMin}-${ageMax}`
  if (ageMin != null) return `Ages: ${ageMin}+`
  return `Ages: up to ${ageMax}`
}

// The standardized weekly-equivalent price (feedback, 2026-08-18: "can you
// standardize price as a weekly number?") — this app's Sports & Clubs
// prices come in genuinely different shapes (per month, per class, per
// season...), which makes them hard to compare at a glance; price_per_week
// is a hand-computed conversion (see db/schema.ts's pricePerWeek) shown
// here as the one PRIMARY price figure. Always prefixed with "~" — it's a
// derived approximation, never presented as if it were itself a directly
// published rate, same posture as Camps' price_is_estimated flag. Rounded
// to the nearest whole dollar (feedback, 2026-08-18: precise cents on an
// already-approximate number read as false precision — the exact published
// rate is still available verbatim via originalPriceLabel below). No
// "Price:" label once a real amount is known (self-evident via the $ sign
// and /week suffix) — the label stays only for the unpublished case.
export function priceLabel(pricePerWeek: string | null): string {
  if (pricePerWeek == null) return 'Price: not published'
  const value = Number(pricePerWeek)
  if (Number.isNaN(value)) return 'Price: not published'
  return `~$${Math.round(value)}/week`
}

// The real, originally published rate (e.g. "$265 per session") — never
// hidden just because priceLabel above shows the standardized weekly
// figure instead; shown as a small transparency footnote on the detail
// page (see SportsClubDetailPage.tsx) so the standardized number is always
// traceable back to its real source, mirroring Camps' own "never derive
// without keeping the real published number visible" posture.
export function originalPriceLabel(price: string | null, priceUnit: string | null): string | null {
  if (price == null) return null
  const value = Number(price)
  if (Number.isNaN(value)) return null
  const amount = `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`
  return priceUnit ? `${amount} ${priceUnit}` : amount
}

export function distanceLabel(distanceMiles: string | null): string {
  if (distanceMiles == null) return 'Distance: unknown'
  const value = Number(distanceMiles)
  if (Number.isNaN(value)) return 'Distance: unknown'
  return `${value.toFixed(1)} mi`
}

// Whether sign-up is actually open right now — same enum/posture as Camps'
// bookingStatusLabel: a listing whose real system couldn't be checked (or
// simply hasn't been researched yet) shows "Unknown" rather than omitting
// the line, so the set of fields shown never varies listing to listing.
const SIGNUP_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  full: 'Full',
  waitlist: 'Waitlist',
  not_opened: 'Not open yet',
}

export function signupStatusLabel(status: string | null): string {
  return `Sign-up: ${status != null && status in SIGNUP_STATUS_LABELS ? SIGNUP_STATUS_LABELS[status] : 'Unknown'}`
}

// Same muted, non-stock-IonBadge-color palette as Camps' bookingStatusChipStyle.
export function signupStatusChipStyle(status: string | null): { background: string; color: string } {
  if (status === 'open') return { background: '#dcf3e3', color: '#1f7a43' }
  if (status === 'full') return { background: '#f8dede', color: '#a3352b' }
  if (status === 'waitlist') return { background: '#faedcf', color: '#8a6416' }
  return { background: '#e8e8ea', color: '#5f6368' }
}

export interface DetailedSportsClub {
  price_per_week: string | null
  age_min: number | null
  age_max: number | null
}

// Price/age, in that order, always shown by default — joined for the
// compact "~$45/week · Ages: 5-13" line shared by the list row and the
// detail page. Distance lives next to the address instead, same as Camps.
// includePrice/includeAge default to true (the list row always wants both —
// there's no options table there to fall back on); the detail page passes
// false once a listing has a real, structured `options` breakdown, same
// suppression Camps' campDetailsLine already established — once every
// option row shows its own time/age/price, repeating the summary again
// above the table would be redundant.
export function sportsClubDetailsLine(
  club: DetailedSportsClub,
  opts: { includePrice?: boolean; includeAge?: boolean } = {},
): string {
  const { includePrice = true, includeAge = true } = opts
  return [includePrice ? priceLabel(club.price_per_week) : null, includeAge ? ageRangeLabel(club.age_min, club.age_max) : null]
    .filter((label): label is string => label !== null)
    .join(' · ')
}

// Compact, unlabeled cell formatters for the Options table (see
// SportsClubDetailPage.tsx's OptionsTable) — mirrors Camps' identical
// optionTimeCell/optionAgeCell/optionPriceCell shape. A null field reads as
// "—" in a table cell (like a blank cell on a real printed schedule), not a
// full "not specified" sentence, which would break the aligned layout.
export function optionTimeCell(startTime: string | null, endTime: string | null): string {
  if (!startTime) return '—'
  return formatTimeRange(startTime, endTime)
}

export function optionAgeCell(ageMin: number | null, ageMax: number | null): string {
  if (ageMin == null && ageMax == null) return '—'
  if (ageMin != null && ageMax != null) return ageMin === ageMax ? `${ageMin}` : `${ageMin}-${ageMax}`
  if (ageMin != null) return `${ageMin}+`
  return `up to ${ageMax}`
}

export function optionPriceCell(price: string | null, priceUnit: string | null): string {
  if (price == null) return '—'
  const value = Number(price)
  if (Number.isNaN(value)) return '—'
  const amount = `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`
  return priceUnit ? `${amount} ${priceUnit}` : amount
}

// Options are shown in the array's own order (not re-sorted) — unlike
// Camps' price-sorted table, most Sports & Clubs option sets are ordered by
// something more meaningful than price (e.g. Uniting Voices Chicago's three
// levels, youngest/earliest first), so the seed data's own order is trusted.

// Same reasoning as Camps' locationLabel/shortAddress/mapUrl.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export interface LocatableSportsClub {
  locationName: string | null
  address: string | null
}

export function locationLabel(club: LocatableSportsClub): string | null {
  if (club.locationName) return club.locationName
  return club.address ? club.address.replace(CITY_STATE_ZIP, '').trim() : null
}

export function shortAddress(address: string): string {
  return address.replace(CITY_STATE_ZIP, '').trim()
}

export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export interface CalendarSportsClub {
  title: string
  description: string | null
  location_name: string | null
  address: string | null
  first_date: string | null
  last_date: string | null
  occurrences: SportsClubOccurrence[]
}

export interface CalendarEvent {
  title: string
  description: string | null
  location: string | null
  startDate: string
  endDate?: string
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
}

// What "Add to Calendar" should actually add — the real next occurrence
// (a genuine, specific meeting) when one is known, since that's the most
// actionable thing a member could put on their own calendar; falling back
// to the listing's own first/last day as an all-day block (same convention
// Camps' AddToCalendarButton usage already established for a multi-day
// span) when no occurrence data exists yet. Returns null — no button shown
// at all — for a listing with neither (an ongoing club with no confirmed
// day/time), since there's nothing concrete to add.
export function calendarEventForSportsClub(club: CalendarSportsClub): CalendarEvent | null {
  const next = club.occurrences[0]
  const location = club.location_name ?? club.address ?? null
  if (next) {
    return {
      title: club.title,
      description: club.description,
      location,
      startDate: next.date,
      startTime: next.start_time,
      endTime: next.end_time,
      allDay: !next.start_time,
    }
  }
  if (club.first_date) {
    return {
      title: club.title,
      description: club.description,
      location,
      startDate: club.first_date,
      endDate: club.last_date ?? club.first_date,
      allDay: true,
    }
  }
  return null
}
