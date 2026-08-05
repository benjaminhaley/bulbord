import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog, type CampOptionLine } from '../db/schema.js'

// One-off, rerunnable backfill applying two corrections to Family Room's
// existing camp rows (feedback, 2026-08-05, from a screenshot of the live
// page): (1) "Family Room's time definitely should be specified. It's
// clear in the booking text" — reverses the original "genuinely flexible,
// don't fabricate a time" call; startTime/endTime now show the provider's
// own published max window (7:00am drop-off to 6:00pm pick-up), same
// max-time convention ClimbZone's time/price already follow. (2) "remove
// the shown above note and the part of bookings that's talking about
// pickup and drop off hours, which belong above instead" — drop-off/
// pick-up hours moved out of booking_instructions now that they're the
// camp's own start_time/end_time, and "(shown above)" trimmed from the
// Full-Day Pass option line since it's redundant with the compact price
// line regardless.
const OPTIONS: CampOptionLine[] = [
  { label: 'Express Pass', detail: '3 hours · $45/day' },
  { label: 'Half-Day Pass', detail: '5 hours · $65/day' },
  { label: 'Full-Day Pass', detail: '9 hours · $95/day' },
]

async function main() {
  const [source] = await db
    .select({ id: campSources.id })
    .from(campSources)
    .where(and(eq(campSources.name, 'Family Room Chicago (Broadway)'), isNull(campSources.deletedAt)))
    .limit(1)
  if (!source) {
    console.log('No camp_sources row found for "Family Room Chicago (Broadway)" — aborting')
    process.exit(1)
  }

  const updatedRows = await db
    .update(camps)
    .set({
      startTime: '07:00',
      endTime: '18:00',
      options: OPTIONS,
      bookingInstructions: 'Book online and pick a date.',
      updatedAt: new Date(),
    })
    .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'claude:camps-familyroom-time-2026-08-05',
    action: 'camps_familyroom_time_backfill',
    metadata: { updatedCount: updatedRows.length },
  })

  console.log(`Family Room Chicago (Broadway): updated ${updatedRows.length} camp(s).`)
}

await main()
process.exit(0)
