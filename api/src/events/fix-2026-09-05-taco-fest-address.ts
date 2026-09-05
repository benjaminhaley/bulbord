import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Last remaining flag from the full-pipeline audit sweep: "Lakeview Taco
// Fest"'s address ("Southport Ave, Chicago, IL 60657 (Southport Corridor)")
// still tripped the vague-location check even after the rule was tightened
// to explicitly allow a bare real street name — the trailing "(Southport
// Corridor)" neighborhood label seems to have thrown it off. Rather than
// fight the model's own reading of an ambiguous-looking string, replaced it
// with the real bounded range (do312.com's own event listing: "On Southport
// between Addison and Roscoe"), the same unambiguous shape as every other
// fix in this pass.
const EVENT_ID = 'b0a5a908-2168-40b9-a155-40f844181536'
const NEW_ADDRESS = 'Southport Ave between Addison St & Roscoe St, Chicago, IL 60657'

async function main() {
  await db.update(events).set({ address: NEW_ADDRESS, updatedAt: new Date() }).where(eq(events.id, EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'Full-pipeline audit follow-up: replaced an ambiguous-looking address with the real bounded street range',
      eventId: EVENT_ID,
    },
  })

  console.log('Done.')
}

await main()
process.exit(0)
