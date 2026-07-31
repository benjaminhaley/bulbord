import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Human-friendly place names for addresses that are venues with a known,
// well-established name (school, library, park, CTA station) rather than a
// generic street/intersection — matched on the exact address string sourced
// events already share. Addresses left unmapped here are already an
// intersection or bare street ("Halsted St between Addison St & Belmont
// Ave", "N Broadway"), which is an acceptable fallback per the feedback item.
const LOCATION_NAMES_BY_ADDRESS: Record<string, string> = {
  '3252 N Broadway, Chicago, IL 60657': 'Nettelhorst School',
  '644 W Belmont Ave, Chicago, IL 60657': 'Merlo Library',
  'Southport Ave & Newport Ave (CTA Southport station), Chicago, IL 60657': 'Southport CTA Station',
  '825 W Sheridan Rd, Chicago, IL 60613': 'Gill Park',
}

async function main() {
  let updatedCount = 0
  const updatedIds: string[] = []

  for (const [address, locationName] of Object.entries(LOCATION_NAMES_BY_ADDRESS)) {
    const rows = await db
      .update(events)
      .set({ locationName, updatedAt: new Date() })
      .where(eq(events.address, address))
      .returning({ id: events.id })
    updatedCount += rows.length
    updatedIds.push(...rows.map((r) => r.id))
  }

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-07-31',
    action: 'event_location_names_backfilled',
    metadata: { updatedCount, eventIds: updatedIds },
  })

  console.log(`Set location_name on ${updatedCount} event(s).`)
}

await main()
process.exit(0)
