import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Two of the three "Sunday Crafternoon" occurrences ended up duplicating
// *other* events' images after automated re-enrichment during the wider
// shared-image cleanup (one matched "A Craft Series September: Jeanius"'s
// pottery photo, the other matched "Craft Supply Swap"'s yarn photo).
// Rather than searching for two more distinct photos, this reuses the
// third occurrence's own real photo (CPL's building photo) across all
// three — the same "one real photo shared across a recurring series' own
// occurrences" convention already used elsewhere in this app (Bike Bus,
// French Market), since these are three dates of the exact same program.
const REFERENCE_EVENT_ID = '2f7984ec-a0ed-4bd3-8509-508c25789f5b'
const TARGET_EVENT_IDS = ['aef95cb3-34b2-4f38-bd07-3fff18cd7fc4', 'c3ac816a-d8f8-4a81-8748-67de86275e27']

async function main() {
  const [reference] = await db
    .select({ imageUrl: events.imageUrl, thumbnailUrl: events.thumbnailUrl })
    .from(events)
    .where(eq(events.id, REFERENCE_EVENT_ID))
  if (!reference) {
    console.log('Reference event not found.')
    return
  }

  const updated = await db
    .update(events)
    .set({ imageUrl: reference.imageUrl, thumbnailUrl: reference.thumbnailUrl, updatedAt: new Date() })
    .where(inArray(events.id, TARGET_EVENT_IDS))
    .returning({ id: events.id, title: events.title })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'wider shared-image cleanup: reused the same real CPL logo photo across all 3 Sunday Crafternoon occurrences (same title/series) after two of them ended up duplicating other events\' photos',
      eventIds: TARGET_EVENT_IDS,
    },
  })

  console.log(`Updated ${updated.length} events: ${updated.map((e) => e.title).join(', ')}`)
}

await main()
process.exit(0)
