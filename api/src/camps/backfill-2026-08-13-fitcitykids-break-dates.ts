import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, eventsLog } from '../db/schema.js'

// Follow-up to backfill-2026-08-13-booking-status.ts: while checking Fit
// City Kids' real live registration status (their public Jackrabbit
// "Openings" list), the actual listed sessions turned out to cover a
// narrower date range than what was seeded — the same partial-break-
// coverage shape Lake View YMCA (breakDateOverrides) and Unicoi Art Studio
// (separate rows) already have documented. Confirmed with Ben (2026-08-13)
// to fix this now rather than leave it as a known gap:
//
// - Thanksgiving: the real listing is "Thanksgiving Break Camp 11/23-11/25"
//   — not the full seeded Nov 23-27 (Thanksgiving Day itself and the day
//   after have no session, same as every other provider's Thanksgiving
//   coverage). The existing camp row's end_date is corrected from 11/27 to
//   11/25.
// - Winter Break: the real listings are two separate sessions,
//   "Holiday Break Camp 12/21-12/23" and "Holiday Break Camp 12/28-12/31"
//   (no Dec 24 or Jan 1 session) — not one continuous Dec 21-Jan 1 row. The
//   existing single row is narrowed to Dec 21-23, and a second row is
//   inserted for Dec 28-31, copying every other field from the original
//   (same provider, price, options, prep items, image) since only the date
//   range differs.

const THANKSGIVING_ID = '8bc90683-0902-4a6b-9872-64a0beda263b'
const WINTER_BREAK_ID = '7447e292-64ab-462e-8092-0b0fbd1fe7d8'

async function main() {
  await db.update(camps).set({ endDate: '2026-11-25', updatedAt: new Date() }).where(eq(camps.id, THANKSGIVING_ID))

  const [winterRow] = await db.select().from(camps).where(eq(camps.id, WINTER_BREAK_ID))
  if (!winterRow) {
    throw new Error(`Fit City Kids Winter Break camp row not found (id ${WINTER_BREAK_ID})`)
  }

  await db.update(camps).set({ endDate: '2026-12-23', updatedAt: new Date() }).where(eq(camps.id, WINTER_BREAK_ID))

  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = winterRow
  const [inserted] = await db
    .insert(camps)
    .values({ ...rest, startDate: '2026-12-28', endDate: '2026-12-31' })
    .returning({ id: camps.id })

  await db.insert(eventsLog).values([
    {
      actor: 'claude:camps-fitcitykids-break-dates-2026-08-13',
      action: 'camp_updated',
      metadata: { campId: THANKSGIVING_ID, reason: 'Thanksgiving end_date corrected 11/27 -> 11/25 to match real live registration listing' },
    },
    {
      actor: 'claude:camps-fitcitykids-break-dates-2026-08-13',
      action: 'camp_updated',
      metadata: { campId: WINTER_BREAK_ID, reason: 'Winter Break end_date corrected 1/1 -> 12/23 (first of two real sessions)' },
    },
    {
      actor: 'claude:camps-fitcitykids-break-dates-2026-08-13',
      action: 'camp_created',
      metadata: { campId: inserted.id, reason: 'second real Winter Break session, 12/28-12/31, split from the original single row' },
    },
  ])

  console.log(`Thanksgiving row narrowed to 11/23-11/25. Winter Break row narrowed to 12/21-12/23; new row ${inserted.id} added for 12/28-12/31.`)
}

await main()
process.exit(0)
