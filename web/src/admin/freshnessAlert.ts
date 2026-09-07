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
  if (!freshness) return null
  const lowCount = freshness.recurring_series_running_low.length
  const parts: string[] = []
  if (freshness.is_stale) parts.push('Events/camps data needs a refresh')
  if (lowCount > 0) {
    parts.push(`${lowCount} recurring listing${lowCount === 1 ? '' : 's'} running low on confirmed dates`)
  }
  // Feedback #140: "I don't get directed to anything actionable and I'm not
  // even sure what I would do" — the alert used to just restate the raw
  // freshness fact with no hint that tapping it goes anywhere specific.
  // Paired with freshnessAlertTargetPath's deep link below, so tapping this
  // now actually scrolls to the flagged content on Dev Tools instead of
  // landing at the top of a long page.
  return parts.length > 0 ? `${parts.join(' — ')} — tap for details` : null
}

// Which part of Dev Tools actually explains this alert — a running-low
// series list is the more specific, more common case (see the "recurring
// listings running low" section), so it wins when both conditions are
// true; a bare `is_stale` with nothing running low points at the "Sourcing
// & Data" section instead, since re-running sourcing from there is the
// actual fix for staleness. Both anchors are real element ids DevToolsPage
// scrolls to and briefly highlights on load (see its own hash-handling effect).
export function freshnessAlertTargetPath(freshness: DataFreshness | null): string {
  if (!freshness) return '/admin/dev-tools'
  if (freshness.recurring_series_running_low.length > 0) return '/admin/dev-tools#recurring-series-health'
  if (freshness.is_stale) return '/admin/dev-tools#sourcing-and-data'
  return '/admin/dev-tools'
}

// Follow-up to feedback #140 (reported directly against an earlier fix: "I
// clicked the alert and it didn't go away") — the original feedback #132
// design deliberately never let this row be dismissed at all ("there's
// nothing to persist or dismiss-via-API... it simply stops appearing once
// the underlying data is refreshed"), which in practice meant it could
// never go away by clicking it, only once someone actually fixed the
// flagged sources/series — day(s) later at best. There's still no real DB
// row to persist a dismissal against, so this is a client-side (per-
// browser) "have I already acknowledged *this specific* freshness
// problem" signature instead: stored in localStorage once dismissed, and
// the alert stays hidden only as long as the signature doesn't change — a
// newly-stale source or a newly-flagged series produces a different
// signature and surfaces as a fresh alert again, the same way a real
// notification would for a new event.
export function freshnessSignature(freshness: DataFreshness | null): string | null {
  if (!freshness) return null
  const lowSeries = freshness.recurring_series_running_low
    .map((s) => `${s.source_id ?? s.title}@${s.last_occurrence_date}`)
    .sort()
    .join(',')
  return `${freshness.is_stale ? 'stale' : 'fresh'}|${lowSeries}`
}
