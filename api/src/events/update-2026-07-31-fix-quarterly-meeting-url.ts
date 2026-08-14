import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// The seeded source_url (quarterly-community-meeting-5) 404s. Southport
// Neighbors' WordPress numbers each quarter's meeting as its own post, and
// -5 was never published — the correct listing is -4 (confirmed live on
// southportneighbors.com/events/, same Oct 19 2026 / Blue Bayou details).
const OLD_URL = 'https://southportneighbors.com/events/quarterly-community-meeting-5/'
const NEW_URL = 'https://southportneighbors.com/events/quarterly-community-meeting-4/'

async function main() {
  const updated = await db
    .update(events)
    .set({ sourceUrl: NEW_URL, updatedAt: new Date() })
    .where(eq(events.sourceUrl, OLD_URL))
    .returning({ id: events.id, title: events.title })

  for (const event of updated) {
    await enrichEventImage(event.id, { sourceUrl: NEW_URL })
  }

  await db.insert(eventsLog).values({
    actor: 'claude:fix-2026-07-31',
    action: 'event_source_url_corrected',
    metadata: { oldUrl: OLD_URL, newUrl: NEW_URL, eventIds: updated.map((e) => e.id) },
  })

  console.log(`Corrected source_url and re-enriched ${updated.length} event(s).`)
}

await main()
process.exit(0)
