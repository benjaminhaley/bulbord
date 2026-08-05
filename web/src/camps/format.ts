// Pure camp-formatting helpers — own copy, deliberately not shared with
// web/src/events/format.ts (camps is a fresh, non-shared clone — see
// CLAUDE.md feedback #50). No newsletter counterpart exists for camps, so
// unlike events/format.ts this file has no byte-identical-parity requirement
// with anything on the api/ side.

function relativeDayLabel(date: Date, today: Date): string | null {
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round((date.getTime() - today.getTime()) / dayMs)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return null
}

function shortDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Camps have no time-of-day (see api/src/db/schema.ts) — a single-day camp
// gets the same Today/Tomorrow/weekday label events use; a multi-day camp
// (a full week of a school break, say) shows as a plain date range instead,
// since a relative "Today – Aug 15" reads oddly for the far end of a range.
export function formatDateRange(startDate: string, endDate: string, now = new Date()): string {
  if (startDate === endDate) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const date = new Date(`${startDate}T00:00:00`)
    return (
      relativeDayLabel(date, today) ?? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    )
  }
  return `${shortDateLabel(startDate)} – ${shortDateLabel(endDate)}`
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
export function priceLabel(pricePerDay: string | null, isEstimated = false): string {
  if (pricePerDay == null) return 'Price: not published'
  const value = Number(pricePerDay)
  if (Number.isNaN(value)) return 'Price: not published'
  const amount = `$${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}/day`
  return isEstimated ? `Price: ${amount} (estimated)` : `Price: ${amount}`
}

export function distanceLabel(distanceMiles: string | null): string {
  if (distanceMiles == null) return 'Distance: unknown'
  const value = Number(distanceMiles)
  if (Number.isNaN(value)) return 'Distance: unknown'
  return `Distance: ${value.toFixed(1)} mi`
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

export interface DetailedCamp {
  price_per_day: string | null
  price_is_estimated: boolean
  age_min: number | null
  age_max: number | null
  distance_miles: string | null
  spots_available: number | null
}

// Price/age/distance, in that order, always shown — joined for the
// "Price: $70/day · Ages: 5-13 · Distance: 1.3 mi" line shared by the list
// row and the detail page. Spots is appended only when actually known (see
// spotsLabel) — unlike the other three, "unknown" isn't shown for it.
export function campDetailsLine(camp: DetailedCamp): string {
  return [
    priceLabel(camp.price_per_day, camp.price_is_estimated),
    ageRangeLabel(camp.age_min, camp.age_max),
    distanceLabel(camp.distance_miles),
    spotsLabel(camp.spots_available),
  ]
    .filter((label): label is string => label !== null)
    .join(' · ')
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
