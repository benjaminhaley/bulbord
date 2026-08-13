// Shared by FeedbackPage and the admin UsersPage — both just want a plain
// "Mon Day, Year" rendering of an ISO timestamp. Events has its own richer
// formatWhen() (start_time/all_day-aware) in web/src/events/format.ts; this
// is the plain one for everything else.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// "Today at 4:57 PM" / "Yesterday" / "Aug 3, 2026" — for a "when did this
// last happen" timestamp (e.g. Developer Tools' "sources last checked"),
// where the exact time only matters if it was today. Same short-month/day
// style as formatDate for anything older than yesterday, so date rendering
// stays consistent across the app rather than inventing a second style.
export function formatRelativeDateTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDate = new Date(date)
  startOfDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }
  if (diffDays === -1) return 'Yesterday'
  return formatDate(iso)
}

// Addresses are typically stored as "Street, Chicago, IL 60613" —
// everything in this app is Chicago-area, so the city/state/zip is
// redundant noise once shown as a tappable map link (feedback, 2026-08-05,
// applied first to Camps' detail page: "no reason to include Chicago,
// Illinois there"). Lives here rather than in events/format.ts or
// camps/format.ts — it's pure address-string formatting, not domain logic,
// and events/format.ts is byte-parity-checked against the newsletter email
// template (see scripts/check-format-parity.mjs), which has no use for a
// map link, so adding it there would leave a dead, knip-flagged export on
// the api side. Both events/format.ts and camps/format.ts keep their own
// copy of this same regex for their list-view location labels, unchanged —
// this is only for the tappable single-line address use.
const CITY_STATE_ZIP = /,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}$/

export function shortAddress(address: string): string {
  return address.replace(CITY_STATE_ZIP, '').trim()
}

// Google Maps' web search URL works universally (opens the native Maps app
// on both iOS and Android when installed, else falls back to the web) —
// simpler than branching on platform for an Apple Maps deep link. Always
// built from the full, untrimmed address (not shortAddress's output) since
// dropping city/state before geocoding risks a mismatched result.
export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
