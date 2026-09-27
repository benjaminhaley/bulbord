import { type DataFreshness } from './api'

// Feedback #132's "one red badge, no exceptions" nudge (see CLAUDE.md's
// Notifications section) — and feedback #140's follow-ups on it — pulled
// out of NotificationsPage.tsx into its own dependency-free module so
// DataFreshnessContext.tsx (which InstitutionBanner's bell badge reads)
// and NotificationsPage.tsx (which renders the alert row) compute the
// exact same thing from the exact same inputs. They used to be two
// independent computations — the badge read `freshness` directly, the
// notifications list read it through describeFreshnessAlert/dismissal —
// and drifted apart the moment dismissal was added only to the list side
// (feedback, 2026-09-07: "I still see a little red dot even though
// there's no notifications anymore"). One shared definition, consumed by
// both, is what actually prevents that class of bug recurring.

export function describeFreshnessAlert(freshness: DataFreshness | null): string | null {
  if (!freshness?.is_stale) return null
  // Feedback #140: "I don't get directed to anything actionable" — paired
  // with freshnessAlertTargetPath's deep link below, so tapping this
  // scrolls to the section on Dev Tools that fixes it.
  return 'Events/camps data needs a refresh — tap for details'
}

// "#sourcing-and-data" is a real element id DevToolsPage scrolls to and
// briefly highlights on load (see its own hash-handling effect) — re-running
// sourcing from there is the actual fix for staleness.
export function freshnessAlertTargetPath(freshness: DataFreshness | null): string {
  return freshness?.is_stale ? '/admin/dev-tools#sourcing-and-data' : '/admin/dev-tools'
}

// Follow-up to feedback #140 ("I clicked the alert and it didn't go
// away"): there's no real DB row to persist a dismissal against, so this is
// a client-side (per-browser) "have I already acknowledged this specific
// freshness problem" signature, stored in localStorage once dismissed.
export function freshnessSignature(freshness: DataFreshness | null): string | null {
  if (!freshness) return null
  // oldest_at moves whenever data is refreshed, so a later, separate
  // staleness episode gets a new signature and surfaces again.
  return freshness.is_stale ? `stale@${freshness.oldest_at ?? 'never'}` : 'fresh'
}
