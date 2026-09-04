import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Feedback #153 (2026-09-04), "why wasn't the time included for this event?
// ... it certainly can be found": northalsted.com/upcoming/'s own generic
// listing genuinely has no time for this occurrence (confirmed via WebFetch
// — the raw page text has no time near this listing at all, so the original
// extraction wasn't a bug). Found instead via a real announcement for this
// same "Movies in The Parking Lot" series' debut screening: pre-show at
// 8pm, movie at 8:30pm, at the UPark-it Lot (3514 N. Halsted St.) — applied
// here since it's the same recurring series and venue, not a one-off.
const EVENT_ID = '206b5007-3173-4a97-a077-f4bb4d6e0988' // Movies in The Parking Lot: Clue

async function main() {
  const [row] = await db
    .update(events)
    .set({
      startTime: '20:00',
      allDay: false,
      address: '3514 N Halsted St, Chicago, IL 60613',
      locationName: 'UPark-it Lot',
      updatedAt: new Date(),
    })
    .where(eq(events.id, EVENT_ID))
    .returning({ id: events.id, title: events.title })

  if (!row) {
    console.log('Event not found.')
    return
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        "feedback #153: added the confirmed 8pm pre-show start time and UPark-it Lot address, sourced from Northalsted's own announcement for this series' debut screening (same series/venue)",
      eventId: EVENT_ID,
    },
  })

  console.log(`Updated "${row.title}" (${row.id})`)
}

await main()
process.exit(0)
