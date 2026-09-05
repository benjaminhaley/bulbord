import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Found during the full-pipeline audit sweep (feedback #155-158 follow-up):
// "Southport Neighbors Yard Sale"'s own address field was just "Southport
// Corridor, Chicago, IL 60657" — no street/cross-street at all, genuinely
// vague — but its own description already states the real bounded range
// ("Addison to Irving Park, Clark to Ashland"), just never copied into the
// address field. No new research needed; the specific data already existed.
const EVENT_ID = '1d18918c-9408-42b8-9c34-6653ce9c86bd'
const NEW_ADDRESS = 'Southport Ave between Addison St & Irving Park Rd, Chicago, IL 60657'

async function main() {
  await db.update(events).set({ address: NEW_ADDRESS, updatedAt: new Date() }).where(eq(events.id, EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'Full-pipeline audit follow-up: replaced a vague "Southport Corridor" address with the bounded street range already stated in the event\'s own description',
      eventId: EVENT_ID,
    },
  })

  console.log('Done.')
}

await main()
process.exit(0)
