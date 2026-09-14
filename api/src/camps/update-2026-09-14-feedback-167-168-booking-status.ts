import 'dotenv/config'

import { and, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'

// Feedback #167 ("YMCA day off camps have open enrollment now") and #168
// ("Ultimate Ninja Day Off Camps are open") — both re-verified live against
// the real booking systems (not just taken on faith) before writing
// anything, per the Camps sourcing checklist's "never trust a stated
// blanket policy" rule:
//
// - Ultimate Ninjas: queried their real Mindbody widget's own JSONP API
//   (widgets.mindbodyonline.com/widgets/schedules/37225/load_markup) for
//   every currently-seeded not_opened date. Sep 25 and Oct 12, 2026 each now
//   return 3 real sessions (Full-day/AM half/PM half) with live "Sign Up"
//   links straight to Mindbody's own checkout — genuinely open. Every later
//   date (Nov 2 '26 through Apr 12 '27) still returns zero sessions, exactly
//   as the 2026-08-06 widget check found — still not_opened.
// - Lake View YMCA: drove the real Traction Rec/Salesforce registration
//   widget with Playwright (community.ymcachicago.org/s/registration),
//   searched "School Days Out", and expanded the real 20-option list. Every
//   currently-seeded not_opened date that has a real session in that list is
//   now enrollable (Oct 12: 7 spots; Nov 2: 0 spots i.e. full but Nov 3 in
//   the same DB row still has 1 spot, so the row as a whole is 'open'; Nov
//   23-24, Dec 21/22/28/29, Jan 4, Jan 29, Feb 15/23, Mar 22-26, Apr 6/12:
//   all double-digit spots) — 11 of 13 rows. Sep 25, Nov 11, and Jan 18
//   never appear in the live list at all (no session exists there yet),
//   matching the already-correct not_opened status on the two of those we
//   have rows for (Nov 11, Jan 18 — there's no Sep 25 row for this provider
//   at all, correctly, since it was never confirmed to exist).
//
// While re-verifying, also checked every other provider covering Sep 25
// (the date Ben said he'd spot-check) to answer "have any closed now?":
// - Fit City Kids' real public Jackrabbit Openings list
//   (app.jackrabbitclass.com/jr3.0/Openings/OpeningsDirect?OrgID=538382)
//   shows "School's Out Camp September 25th" at 0 openings — genuinely full
//   now, the only one of their 16 listed dates at zero. Every other Fit City
//   Kids date has real remaining seats (15-114), so nothing else there needs
//   to change.
// - ClimbZone Chicago's real iClassPro API still returns
//   {"data":[],"message":"No camps found."} — unchanged from the 2026-08-20
//   finding, still genuinely blocked.
// - Family Room Chicago and Unicoi Art Studio's real booking widgets
//   (WooCommerce Bookings, Sawyer) are both still behind Cloudflare's bot
//   check even via a real headless browser — same wall as previously
//   documented, not independently re-verified this pass.
const NOW = new Date()

const NINJAS_OPEN_DATES = ['2026-09-25', '2026-10-12']

const YMCA_OPEN_DATES = [
  '2026-10-12',
  '2026-11-02', // row spans 11/02-11/03; 11/02 itself is full but 11/03 has 1 spot, so the row is 'open'
  '2026-11-23',
  '2026-12-21',
  '2027-01-04',
  '2027-01-29',
  '2027-02-15',
  '2027-02-23',
  '2027-03-22',
  '2027-04-06',
  '2027-04-12',
]

async function setBookingStatus(sourceName: string, startDates: string[], status: 'open' | 'full', reason: string) {
  const [source] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, sourceName))
  if (!source) throw new Error(`camp_sources row not found for "${sourceName}"`)

  const updated = await db
    .update(camps)
    .set({ bookingStatus: status, updatedAt: NOW })
    .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt), inArray(camps.startDate, startDates)))
    .returning({ id: camps.id, startDate: camps.startDate })

  if (updated.length !== startDates.length) {
    throw new Error(
      `${sourceName}: expected to update ${startDates.length} camp rows (${startDates.join(', ')}) but found ${updated.length} (${updated
        .map((u) => u.startDate)
        .join(', ')})`,
    )
  }

  await db.insert(eventsLog).values({
    actor: 'claude:camps-booking-status-2026-09-14',
    action: 'camp_source_updated',
    metadata: { sourceId: source.id, sourceName, reason: `booking_status set to '${status}' on ${updated.length} camps — ${reason}` },
  })

  console.log(`${sourceName}: set booking_status='${status}' on ${updated.length} camp(s) (${startDates.join(', ')})`)
}

async function recordRecheck(sourceName: string, note: string) {
  const [source] = await db.select({ notes: campSources.notes }).from(campSources).where(eq(campSources.name, sourceName))
  if (!source) throw new Error(`camp_sources row not found for "${sourceName}"`)

  await db
    .update(campSources)
    .set({ notes: `${source.notes ?? ''}\n\n${note}`.trim(), lastCheckedAt: NOW })
    .where(eq(campSources.name, sourceName))

  console.log(`${sourceName}: notes/last_checked_at updated`)
}

async function main() {
  await setBookingStatus(
    'Ultimate Ninjas',
    NINJAS_OPEN_DATES,
    'open',
    "per feedback #168 (2026-09-14), re-verified live against the real Mindbody widget's own JSONP API (both dates return real sessions with live Sign Up links)",
  )
  await setBookingStatus(
    'Lake View YMCA',
    YMCA_OPEN_DATES,
    'open',
    'per feedback #167 (2026-09-14), re-verified live by driving the real Traction Rec registration widget with Playwright (every listed date shows real remaining spots)',
  )
  await setBookingStatus(
    'Fit City Kids',
    ['2026-09-25'],
    'full',
    "found while re-verifying Sep 25 bookability across every provider per Ben's request (2026-09-14) — their real public Jackrabbit Openings list now shows 0 openings for Sep 25, the only one of their 16 listed dates at zero"
  )

  await recordRecheck(
    'ClimbZone Chicago',
    'Re-checked 2026-09-14 while working feedback #167/#168: their real iClassPro API (app.iclasspro.com/api/open/v1/climbzonechicago/camps) still returns {"data":[],"message":"No camps found."} — unchanged from the 2026-08-20 finding, still genuinely blocked. booking_status left as-is.',
  )
  await recordRecheck(
    'Family Room Chicago (Broadway)',
    "Re-attempted 2026-09-14 while working feedback #167/#168: a real headless-browser run of their WooCommerce Bookings date-picker still hits Cloudflare's bot check before any real inventory loads — same wall as the 2026-08-20 finding. booking_status left as-is (Ben's own direct confirmation from feedback #113).",
  )
  await recordRecheck(
    'Unicoi Art Studio',
    "Re-attempted 2026-09-14 while working feedback #167/#168: a real headless-browser run of their Sawyer booking calendar (hisawyer.com/uni-coi-art-studio) hit Cloudflare's bot check before the calendar ever loaded. booking_status left as-is (not independently re-verified this pass).",
  )

  console.log('Done.')
}

await main()
process.exit(0)
