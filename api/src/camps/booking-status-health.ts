// Root-cause fix for feedback #167/#168 (2026-09-14): both were Ben manually
// noticing, from the real provider websites, that a camp's `booking_status`
// was stuck at 'not_opened' even though registration had genuinely opened —
// something nothing in this app had flagged. `booking_status` is a manual,
// point-in-time snapshot (see CLAUDE.md's Camps data model & sourcing
// section) with no automated recheck job the way events' sourcing pipeline
// has one (camps/staleness.ts's getCampsLastUpdatedAt makes the same point
// about staleness generally) — so a 'not_opened' snapshot just sits there,
// silently going stale, until a human happens to check the real booking
// system again.
//
// This isn't a live re-check against the real booking system — the
// providers use too many different, hard-to-automate systems (Mindbody
// widgets, Salesforce/Traction Rec, Jackrabbit, iClassPro, Sawyer,
// WooCommerce, several genuinely blocked by Cloudflare bot protection — see
// the camp_sources notes for Family Room/Unicoi/ClimbZone) to safely
// automate one general check. It's the same shape as
// events/recurring-series-health.ts: a mechanical nudge that surfaces
// exactly which camps are worth a human/Claude spot-check, before a member
// has to notice and file feedback about it.
export interface BookingStatusCampRow {
  campId: string
  title: string
  sourceId: string | null
  sourceName: string | null
  startDate: string // YYYY-MM-DD
  bookingStatus: string | null
}

export interface StaleBookingStatus {
  campId: string
  title: string
  sourceId: string | null
  sourceName: string | null
  startDate: string
  daysUntilStart: number
}

// How close a still-`not_opened` camp has to be before it's worth flagging —
// close enough that "check whether this opened yet" is a real, actionable
// nudge rather than noise about something months out that's genuinely not
// opened yet on purpose (see recurring-series-health.ts's STALE_AFTER_MS-
// style reasoning for the same kind of threshold choice).
const WARN_WITHIN_DAYS = 21

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay)
}

export function findStaleBookingStatuses(rows: BookingStatusCampRow[], today: string): StaleBookingStatus[] {
  const results: StaleBookingStatus[] = []

  for (const row of rows) {
    if (row.bookingStatus !== 'not_opened') continue
    const daysUntilStart = daysBetween(today, row.startDate)
    // A camp whose start date has already passed isn't actionable (nothing
    // upcoming to recheck), and one further out than the window is
    // genuinely too early to expect an update yet.
    if (daysUntilStart < 0 || daysUntilStart > WARN_WITHIN_DAYS) continue
    results.push({
      campId: row.campId,
      title: row.title,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      startDate: row.startDate,
      daysUntilStart,
    })
  }

  return results.sort((a, b) => a.daysUntilStart - b.daysUntilStart)
}
