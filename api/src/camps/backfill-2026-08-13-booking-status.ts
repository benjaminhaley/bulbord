import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'

// Feedback #68 ("share whether bookings are open or not... look up
// information for each of the camps"): backfills camps.bookingStatus on all
// 66 existing camp rows across the six providers with real live camps
// (BitSpace/Chicago Park District/Sky Zone already generate zero candidates
// — see their own hasRecurringOffering: false notes — so there's nothing to
// backfill for them). Every status below is a direct, live check of the
// provider's own real booking system on 2026-08-13 (not the marketing page,
// not the previously-stated recurring policy) — same "check the real
// system, never trust a stated blanket policy" rigor as the rest of this
// file's Data sourcing quality checklist. Each provider's own real system
// turned out to be reachable after all with the right technique, same
// lesson as Ultimate Ninjas' live-widget-check backfill: don't write off a
// system as unqueryable without first trying its real underlying API/portal,
// not just its marketing page.
//
// One booking_status value applies to every one of a provider's camp rows in
// this pass (not per-individual-date) — for the two 'open' providers this
// was confirmed by literally querying every one of that provider's specific
// seeded dates and finding every one open; for the four 'not_opened'
// providers, every date checked (or, for Fit City Kids below, N/A —
// see its own note) came back the same way, so there was no per-date split
// to make.
//
// - ClimbZone Chicago -> not_opened. Their real registration system is
//   iClassPro (portal.iclasspro.com/climbzonechicago, found via the
//   "REGISTER HERE" button on their camps page — previously assumed
//   unqueryable, but the portal exposes a real public JSON API,
//   app.iclasspro.com/api/open/v1/climbzonechicago/camps). Queried directly
//   (with and without a locationId/date filter): every call returns
//   {"data":[],"message":"No camps found."} — nothing at all is currently
//   posted in the live system, despite the real stated policy/pricing on
//   their marketing page. Same shape of finding as BitSpace/Chicago Park
//   District/Ultimate Ninjas: a real recurring-offering claim with real
//   pricing, but nothing actually bookable yet.
// - Family Room Chicago (Broadway) -> not_opened. Their real WooCommerce
//   Bookings date-picker (product 11201) was stepped month-by-month from
//   Jul 2026 through May 2027 (a headless browser, since the calendar is
//   client-rendered) — every single day in every one of this app's seeded
//   months (Sep 2026 - Apr 2027) reads "This date is unavailable"; the only
//   partially-open days found anywhere were a few in Aug 2026, already past
//   this app's date range. Re-confirms the original 2026-08-04 finding
//   ("isn't populated with inventory for dates this far out") still holds.
// - Fit City Kids -> open. Their real registration system is a public
//   Jackrabbit Class "Openings" list (app.jackrabbitclass.com/jr3.0/
//   Openings/OpeningsDirect?OrgID=538382, no login required — previously
//   assumed unreachable because the *account-creation* registration form
//   requires signing up first, but the openings list itself doesn't) —
//   every one of this app's 11 seeded dates has a real, live "School's Out
//   Camp"/break-camp listing with "Register" status and real open-seat
//   counts (as low as 20, as high as 106). Note: the real listings show
//   Thanksgiving coverage as Nov 23-25 only (not the full seeded Nov 23-27)
//   and Winter Break as two separate Dec 21-23 / Dec 28-31 sessions (no
//   Jan 1) — the same partial-break-coverage shape YMCA/Unicoi already have
//   documented breakDateOverrides for, flagged here for a future pass to
//   apply the same override rather than fixed silently as a side effect of
//   this booking-status pass.
// - Lake View YMCA -> not_opened. Their real registration system is a
//   Salesforce/TractionRec community portal
//   (community.ymcachicago.org/s/registration), searchable without login.
//   Searching "School Days Out" system-wide shows several sibling YMCA
//   locations (Buehler, Foglia, Indian Boundary, Irving Park) already have a
//   live "26-27 School Days Out" course posted — but Lake View's own results
//   show only leftover "25-26" (last school year) listings, no 26-27 course
//   at all. This supersedes the 2026-08-04 finding (Ben's manual check found
//   Oct 12 as the earliest open date) — as of this live re-check, nothing
//   for the 26-27 year is posted for Lake View specifically, even though it
//   was roughly two weeks ago; booking status is expected to change over
//   time (see CLAUDE.md's Camps section), so this isn't a contradiction, just
//   a more current snapshot.
// - Ultimate Ninjas -> not_opened. Re-ran the exact live-widget check from
//   backfill-2026-08-06-ninjas-live-widget-check.ts (Mindbody schedule
//   37225's own JSONP API) against all 11 seeded dates today: still "we
//   didn't find anything available" for every one, unchanged from the
//   2026-08-06 finding.
// - Unicoi Art Studio -> open. Their real Sawyer booking calendar's own
//   underlying API (hisawyer.com/api/v1/widget/calendar_scheduled_activities)
//   was queried directly (via a headless browser, since the endpoint sits
//   behind Cloudflare bot protection that blocks a plain fetch) for all 11
//   seeded dates — every session on every date shows a real open_spots_count
//   (18-180) and an enabled "More Info"/booking CTA, not full or waitlisted.

const OPEN_PROVIDERS = ['Fit City Kids', 'Unicoi Art Studio']
const NOT_OPENED_PROVIDERS = ['ClimbZone Chicago', 'Family Room Chicago (Broadway)', 'Lake View YMCA', 'Ultimate Ninjas']

async function setStatus(providerName: string, status: 'open' | 'not_opened') {
  const [source] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, providerName))
  if (!source) {
    throw new Error(`camp_sources row not found for "${providerName}"`)
  }

  const updated = await db
    .update(camps)
    .set({ bookingStatus: status, updatedAt: new Date() })
    .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'claude:camps-booking-status-2026-08-13',
    action: 'camp_source_updated',
    metadata: { sourceId: source.id, sourceName: providerName, reason: `booking_status set to '${status}' on ${updated.length} camps via live registration-system check` },
  })

  console.log(`${providerName}: set booking_status='${status}' on ${updated.length} camps`)
}

async function main() {
  for (const name of OPEN_PROVIDERS) {
    await setStatus(name, 'open')
  }
  for (const name of NOT_OPENED_PROVIDERS) {
    await setStatus(name, 'not_opened')
  }
}

await main()
process.exit(0)
