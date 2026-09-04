import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Ben: "the event title here is too long. It should just be Retro on
// Roscoe for this particular one." (2026-09-04, a follow-up to feedback
// #152). Shortened from "Roscoe Village Neighbors: Retro on Roscoe" — a
// one-off title edit for this specific event, not a general rule.
const EVENT_ID = 'bd3d494d-e7b8-4865-9f73-f137e3f85b88'

async function main() {
  const [row] = await db
    .update(events)
    .set({ title: 'Retro on Roscoe', updatedAt: new Date() })
    .where(eq(events.id, EVENT_ID))
    .returning({ id: events.id, title: events.title })

  if (!row) {
    console.log('Event not found.')
    return
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: { reason: 'Ben: title too long, shorten to just Retro on Roscoe for this event', eventId: EVENT_ID },
  })

  console.log(`Updated title to "${row.title}" (${row.id})`)
}

await main()
process.exit(0)
