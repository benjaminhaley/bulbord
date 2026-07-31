import 'dotenv/config'
import { and, isNull, isNotNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImages } from './image-enrichment.js'

// One-off backfill: pulls og:image for existing events that predate the
// image-enrichment step added to ingestEvents. New events get this
// automatically going forward; this catches everything already in the table.
async function main() {
  const rows = await db
    .select({ id: events.id, sourceUrl: events.sourceUrl })
    .from(events)
    .where(and(isNull(events.deletedAt), isNull(events.imageUrl), isNotNull(events.sourceUrl)))

  const candidates = rows.map((row) => ({ id: row.id, sourceUrl: row.sourceUrl! }))
  const enriched = await enrichEventImages(candidates)

  await db.insert(eventsLog).values({
    actor: 'claude:image-backfill-2026-07-31',
    action: 'events_image_backfill',
    metadata: { candidateCount: candidates.length, enriched },
  })

  console.log(`Enriched ${enriched} of ${candidates.length} event(s) with an image.`)
}

await main()
process.exit(0)
