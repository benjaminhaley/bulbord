import 'dotenv/config'

import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

// Full-image-sweep follow-up: these 7 events still carry their original,
// actively wrong-subject image after multiple automated re-enrichment
// attempts (both page-extraction, now with the loader.gif bug fixed, and
// web-search with real relevance scoring) found nothing better — the
// subjects are specific enough (a particular school, a particular zoo
// animal exhibit, a particular neighborhood festival) that no matching
// stock photo exists on Wikimedia Commons. Rather than leave a confidently
// wrong photo live (a different school's open house, a zoo lion for an
// elephant event, a different city's festival stage), replaced with an
// honest generated placeholder — same "no fake/broken substitute" posture
// as C3's own placeholder fallback. A real photo can still replace these
// later if one is found; a wrong one actively misleads a member today.
const EVENT_IDS = [
  '14e0d0a2-be09-40b3-a3b8-f3dc34215e9c', // Behind-the-Scenes Tour: Regenstein — band photo
  '6e8d55c1-5b72-4a50-9b7e-ccd194423fc0', // Butterfly Haven Yoga — cargo ship named YOGA
  'fcc475bc-482d-4615-8321-4dce8cb3cc0a', // Film Screening: Cinderella (1950) — corporate IP-day photo
  'de1d7385-680c-4ef5-be15-fc3722141bff', // Musical Theater Club — different venue building
  'bd3d494d-e7b8-4865-9f73-f137e3f85b88', // Retro on Roscoe — Coke Live Festival stage (different event)
  '422f4aec-6543-48cd-a557-0a15031ff631', // Sesame Street and the Great Elephant Adventure — zoo lion
  '4d9fc592-2f7e-42ec-9253-2f451cf9c339', // St Josaphat School Tour & Coffees — different school
]

async function main() {
  const rows = await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const placeholder = await uploadPlaceholderImage(row.title, 'events')
    await db
      .update(events)
      .set({ imageUrl: placeholder.imageUrl, thumbnailUrl: placeholder.thumbnailUrl, sourceImageUrl: null, updatedAt: new Date() })
      .where(eq(events.id, row.id))
    console.log(`Placeholder applied: "${row.title}"`)
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'Full-image-sweep follow-up: replaced 7 actively wrong-subject images (no real match found after repeated automated attempts) with honest placeholders',
      eventIds: rows.map((r) => r.id),
    },
  })

  console.log(`\nDone: ${rows.length} events.`)
}

await main()
process.exit(0)
