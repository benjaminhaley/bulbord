import 'dotenv/config'
import { and, eq, isNull, lte } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'

// Feedback #112/#113 (2026-08-20): Ben directly confirmed, from checking
// each provider's own real booking system himself, that both are now open —
// a live automated re-check attempted first for both (see below) but hit a
// genuine wall in both cases, so this follows CLAUDE.md's existing "a
// human's direct check as ground truth" allowance (Camps data model &
// sourcing's sourcing checklist, item 1) rather than leaving the prior
// not_opened snapshot in place unconfirmed.
//
// - Family Room Chicago (Broadway) -> open, feedback #113 ("Family room
//   camps are open all the way through June 11, 2027, so please mark all of
//   them as open"). Every one of this app's 11 already-seeded Family Room
//   dates ends by 2027-04-12, well within that window, so this applies to
//   all 11 rows with no date split needed. Their real WooCommerce Bookings
//   date-picker is client-rendered and sits behind Cloudflare bot
//   protection (the same wall the 2026-08-13 backfill hit) — not
//   independently re-verified here, taken directly from Ben's own check.
// - ClimbZone Chicago -> open, feedback #112 ("all camps should be open
//   through Thanksgiving"), scoped to the 4 already-seeded dates on or
//   before the Nov 23-27 Thanksgiving-week camp (Sep 25, Nov 2-3, Nov 11,
//   Nov 23-27) — the later dates (Dec 21 onward) are left as they were,
//   since Ben's own statement was bounded to "through Thanksgiving," not
//   the full seeded range. Re-attempted their real iClassPro system live
//   (app.iclasspro.com/api/open/v1/climbzonechicago/camps returned an empty
//   {"data":[]} again, and a headless-browser run of the real customer
//   portal stalls at a "Select a location!" step that requires an
//   interactive click before it ever calls the camps endpoint) — genuinely
//   blocked the same way BitSpace's calendar was confirmed blocked via
//   Playwright, not just assumed; taken directly from Ben's own check.

async function main() {
  const [familyRoom] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, 'Family Room Chicago (Broadway)'))
  if (!familyRoom) throw new Error('camp_sources row not found for "Family Room Chicago (Broadway)"')

  const familyRoomUpdated = await db
    .update(camps)
    .set({ bookingStatus: 'open', updatedAt: new Date() })
    .where(and(eq(camps.sourceId, familyRoom.id), isNull(camps.deletedAt)))
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'claude:camps-booking-status-2026-08-20',
    action: 'camp_source_updated',
    metadata: {
      sourceId: familyRoom.id,
      sourceName: 'Family Room Chicago (Broadway)',
      reason: `booking_status set to 'open' on ${familyRoomUpdated.length} camps, per feedback #113 (Ben's direct confirmation)`,
    },
  })
  console.log(`Family Room Chicago (Broadway): set booking_status='open' on ${familyRoomUpdated.length} camps`)

  const [climbZone] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, 'ClimbZone Chicago'))
  if (!climbZone) throw new Error('camp_sources row not found for "ClimbZone Chicago"')

  const THANKSGIVING_CUTOFF = '2026-11-27' // last day of the seeded Nov 23-27 Thanksgiving-week camp

  const climbZoneUpdated = await db
    .update(camps)
    .set({ bookingStatus: 'open', updatedAt: new Date() })
    .where(and(eq(camps.sourceId, climbZone.id), isNull(camps.deletedAt), lte(camps.startDate, THANKSGIVING_CUTOFF)))
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'claude:camps-booking-status-2026-08-20',
    action: 'camp_source_updated',
    metadata: {
      sourceId: climbZone.id,
      sourceName: 'ClimbZone Chicago',
      reason: `booking_status set to 'open' on ${climbZoneUpdated.length} camps (dates through Thanksgiving week only), per feedback #112 (Ben's direct confirmation)`,
    },
  })
  console.log(`ClimbZone Chicago: set booking_status='open' on ${climbZoneUpdated.length} camps (through Thanksgiving)`)
}

await main()
process.exit(0)
