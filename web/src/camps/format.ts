// Pure camp-formatting helpers — own copy, deliberately not shared with
// web/src/events/format.ts (camps is a fresh, non-shared clone — see
// CLAUDE.md feedback #50). No newsletter counterpart exists for camps, so
// unlike events/format.ts this file has no byte-identical-parity requirement
// with anything on the api/ side. The single-day date-labeling rule
// (Today/Tomorrow/"This <Weekday>", bounded to the current Sunday-Saturday
// calendar week) is genuinely shared with events/format.ts though — both
// need the exact same rule (feedback #78) — so it lives in ../dayLabel
// (truly generic shared infra, the same bar auth/uploads/Avatar already
// clear) rather than as a second diverging copy here.
import { dayLabel, type DayLabelMode } from '../dayLabel'

function shortDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Camps have no time-of-day (see api/src/db/schema.ts) — a single-day camp
// gets the same Today/Tomorrow/"This <Weekday>" label events use; a
// multi-day camp (a full week of a school break, say) shows as a plain date
// range instead, since a relative "Today – Aug 15" reads oddly for the far
// end of a range. mode defaults to 'summary' — pass 'detailed' from the
// camp detail page to also show the actual date alongside the word.
export function formatDateRange(startDate: string, endDate: string, now = new Date(), mode: DayLabelMode = 'summary'): string {
  if (startDate === endDate) return dayLabel(startDate, now, mode)
  return `${shortDateLabel(startDate)} – ${shortDateLabel(endDate)}`
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

// House time-formatting style (feedback, 2026-08-05: "9 am - 1 pm", "9:30 -
// 11 am", "noon - 3:30 pm" — see the mark-inferred-data-as-inferred-shaped
// memory for the permanent rule this codifies for any future clock-time
// display, not just camps). Three rules: (1) omit minutes entirely when
// they're :00 — "9 am", not "9:00 am"; (2) "noon"/"midnight" instead of "12
// pm"/"12 am"; (3) am/pm is shown on both ends of a range only when they
// actually differ (e.g. morning into afternoon) — when both ends share the
// same side, it's shown once, on the end only, since repeating it on the
// start too is redundant ("9:30 – 11 am", not "9:30 am – 11 am").
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

// Exact camp hours (feedback, 2026-08-05: "make sure all camps list the
// exact time... more important than the description") — shown as its own
// prominent line, right under the date, on both the list row and the detail
// page, not folded into campDetailsLine's price/age/distance/spots line.
// Always a labeled string, same "never silently omit" posture as
// price/age/distance below — a camp with no fixed hours (a flexible
// drop-in pass, or a provider whose hours just aren't confirmed) shows "not
// specified" rather than a fabricated time. Same "drop the label once the
// value is self-evident" rule as priceLabel/distanceLabel below (feedback,
// 2026-08-05: "get rid of Time, colon, here? It's redundant because AM and
// PM is shown") — the "Time:" prefix stays only for the unknown case, where
// there's no AM/PM to imply what "not specified" refers to.
export function timeLabel(startTime: string | null, endTime: string | null): string {
  if (!startTime) return 'Time: not specified'
  return formatTimeRange(startTime, endTime)
}

// Every one of these always returns a labeled string, never null/empty —
// feedback (2026-08-04): a camp missing a field (unpublished price, no
// stated age range) should still show that field's line, explicitly marked
// unknown, rather than silently omitting it. This applies uniformly across
// every camp, hand-seeded or member-submitted.
export function ageRangeLabel(ageMin: number | null, ageMax: number | null): string {
  if (ageMin == null && ageMax == null) return 'Ages: not specified'
  if (ageMin != null && ageMax != null) return ageMin === ageMax ? `Ages: ${ageMin}` : `Ages: ${ageMin}-${ageMax}`
  if (ageMin != null) return `Ages: ${ageMin}+`
  return `Ages: up to ${ageMax}`
}

// price_per_day comes back from the API as a numeric-column string (e.g.
// "45.00"), same reason drizzle serializes numeric columns as strings
// elsewhere in this codebase. isEstimated (camps.price_is_estimated) marks a
// price inferred from a provider's stated recurring policy rather than an
// individually published listing for this exact date — always surfaced to
// the user, never silently shown as if confirmed.
//
// No "Price:" label when a real amount is known (feedback, 2026-08-05: "you
// don't need the word price... price is implied by the fact that there's a
// dollar sign there") — the label is kept only for the unpublished case,
// where there's no $ sign to imply what "not published" refers to.
export function priceLabel(pricePerDay: string | null, isEstimated = false): string {
  if (pricePerDay == null) return 'Price: not published'
  const value = Number(pricePerDay)
  if (Number.isNaN(value)) return 'Price: not published'
  const amount = `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}/day`
  return isEstimated ? `${amount} (estimated)` : amount
}

// Same "drop the label when the unit already implies it" rule as priceLabel
// above — "mi" makes a known distance self-evident; "unknown" alone would
// not be, so the label stays for that case only.
export function distanceLabel(distanceMiles: string | null): string {
  if (distanceMiles == null) return 'Distance: unknown'
  const value = Number(distanceMiles)
  if (Number.isNaN(value)) return 'Distance: unknown'
  return `${value.toFixed(1)} mi`
}

// Real-time availability isn't tracked (no live booking integration), so
// spots_available is null for nearly every camp — unlike price/age/distance
// above, an "unknown" spots line reads as noise rather than useful honesty
// when it's the overwhelming common case (feedback, 2026-08-05: "very
// distracting"). Omitted entirely (null) when unknown; still shown, same as
// before, once a member or provider actually knows a real number.
export function spotsLabel(spotsAvailable: number | null): string | null {
  if (spotsAvailable == null) return null
  if (spotsAvailable <= 0) return 'Spots: full'
  return `Spots: ${spotsAvailable} available`
}

// Whether the camp's real registration system is actually open right now
// (feedback #68) — 'open' | 'full' | 'waitlist' | 'not_opened', hand-checked
// per camp/date the same way price/hours were (see CLAUDE.md's Data sourcing
// quality checklist). Same "always show a label, even when unknown" posture
// as ageRangeLabel/distanceLabel above — a camp whose real booking system
// couldn't be checked (a JS-rendered widget, or simply not yet researched)
// shows "Booking: Unknown" rather than omitting the line, so the set of
// fields shown never varies camp to camp.
const BOOKING_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  full: 'Full',
  waitlist: 'Waitlist',
  not_opened: 'Not open yet',
}

export function bookingStatusLabel(status: string | null): string {
  return `Booking: ${status != null && status in BOOKING_STATUS_LABELS ? BOOKING_STATUS_LABELS[status] : 'Unknown'}`
}

// Color-codes the booking-status chip so it reads at a glance (feedback
// #68: "this should be clear"). Deliberately NOT Ionic's stock
// success/danger/warning IonBadge colors (feedback, 2026-08-13, from a
// screenshot: the bright saturated green "reads strange" — it would have
// been the first `success`-colored badge anywhere in this app; every
// existing badge here uses the muted `warning`/`medium` palette instead —
// see SourceDetailPage/CampSourceDetailPage's is_stale/status badges). These
// are soft background/foreground pairs at the same low saturation as that
// existing gray/orange convention, applied via inline style rather than
// IonBadge's `color` prop.
export function bookingStatusChipStyle(status: string | null): { background: string; color: string } {
  if (status === 'open') return { background: '#dcf3e3', color: '#1f7a43' }
  if (status === 'full') return { background: '#f8dede', color: '#a3352b' }
  if (status === 'waitlist') return { background: '#faedcf', color: '#8a6416' }
  return { background: '#e8e8ea', color: '#5f6368' }
}

export interface DetailedCamp {
  price_per_day: string | null
  price_is_estimated: boolean
  age_min: number | null
  age_max: number | null
  spots_available: number | null
}

// Price/age/spots, in that order, always shown — joined for the
// "Price: $70/day · Ages: 5-13" line shared by the list row and the detail
// page. Distance deliberately lives next to the address instead (feedback,
// 2026-08-05: "put the distance side by side with the address... it's just
// more relevant for address information") — see CampDetailPage.tsx's
// address line and CampsPage.tsx's CampRow, both of which append
// distanceLabel directly onto their location text. Spots is appended only
// when actually known (see spotsLabel) — unlike price/age, "unknown" isn't
// shown for it.
//
// includePrice/includeAge default to true (the list row always wants both —
// there's no options table there to fall back on) — CampDetailPage passes
// false for a camp with a populated `options` breakdown (feedback,
// 2026-08-05: "we don't need to list age[,] time[,] and price up top
// because we're really just highlighting... the most expansive of the
// options" — once every option row shows its own time/age/price, repeating
// the max-time summary again above the table is redundant). A camp with no
// options (a member-submitted camp, or any provider with just a flat rate
// and no real tiers) still needs both here, since the table isn't shown at
// all for it.
export function campDetailsLine(camp: DetailedCamp, opts: { includePrice?: boolean; includeAge?: boolean } = {}): string {
  const { includePrice = true, includeAge = true } = opts
  return [
    includePrice ? priceLabel(camp.price_per_day, camp.price_is_estimated) : null,
    includeAge ? ageRangeLabel(camp.age_min, camp.age_max) : null,
    spotsLabel(camp.spots_available),
  ]
    .filter((label): label is string => label !== null)
    .join(' · ')
}

// Compact, unlabeled cell formatters for the Options table (see
// CampDetailPage.tsx's OptionsTable) — deliberately distinct from
// timeLabel/ageRangeLabel/priceLabel above, which spell out a full
// "not specified"/"unknown" sentence appropriate for a standalone line, not
// a table cell where that much text would break the aligned layout. A null
// field here just reads as "—", matching how a real printed schedule shows
// a blank/inapplicable cell rather than a placeholder sentence.
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

export function optionPriceCell(price: string | null): string {
  if (price == null) return '—'
  const value = Number(price)
  if (Number.isNaN(value)) return '—'
  return `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}`
}

// Most-expensive-first (feedback, 2026-08-05: "sort for most expensive to
// cheapest") — computed at render time from each option's own `price`
// rather than trusting hand-authored array order in the seed data, so a
// future provider's options are never accidentally out of order. An
// unpublished price (null, or unparseable) sorts last, same as it not being
// confidently comparable to a real dollar amount.
export function sortOptionsByPrice<T extends { price: string | null }>(options: T[]): T[] {
  const priceValue = (price: string | null) => {
    if (price == null) return -Infinity
    const value = Number(price)
    return Number.isNaN(value) ? -Infinity : value
  }
  return [...options].sort((a, b) => priceValue(b.price) - priceValue(a.price))
}

// Addresses are typically stored as "Street, Chicago, IL 60613" — everything
// in this app is Chicago-area, so the city/state/zip is redundant noise in
// the abbreviated list view.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export interface LocatableCamp {
  locationName: string | null
  address: string | null
}

export function locationLabel(camp: LocatableCamp): string | null {
  if (camp.locationName) return camp.locationName
  return camp.address ? camp.address.replace(CITY_STATE_ZIP, '').trim() : null
}

// Same reasoning as locationLabel above, applied to the detail page's own
// address line (feedback, 2026-08-05: "no reason to include Chicago,
// Illinois there") — the displayed text drops city/state/zip, but the map
// link itself (mapUrl below) always gets the full, untrimmed address, since
// dropping city/state there would risk mismatched geocoding.
export function shortAddress(address: string): string {
  return address.replace(CITY_STATE_ZIP, '').trim()
}

// Google Maps' web search URL works universally (opens the native Maps app
// on both iOS and Android when installed, else falls back to the web) —
// simpler than branching on platform for an Apple Maps deep link.
export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function joinWithAnd(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const INTERESTED_TEASER_MAX_CHARS = 30

export function buildInterestedTeaser(names: string[], totalCount: number, maxChars = INTERESTED_TEASER_MAX_CHARS): string {
  for (let shown = names.length; shown >= 1; shown--) {
    const truncated = shown < names.length
    const text = truncated ? `${names.slice(0, shown).join(', ')}…` : joinWithAnd(names.slice(0, shown))
    if (text.length <= maxChars || shown === 1) return `${totalCount} interested: ${text}`
  }
  return `${totalCount} interested`
}
