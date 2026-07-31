import 'dotenv/config'
import { and, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImages } from './image-enrichment.js'

// One-off backfill: gives every existing event an image (sourced from its
// og:image where possible, a generated placeholder otherwise) — catches
// events that predate image enrichment, and ones enrichment couldn't find a
// real image for before the placeholder fallback existed.
async function main() {
  const rows = await db
    .select({ id: events.id, sourceUrl: events.sourceUrl, title: events.title })
    .from(events)
    .where(and(isNull(events.deletedAt), isNull(events.imageUrl)))

  const { sourced, placeholder } = await enrichEventImages(rows)

  await db.insert(eventsLog).values({
    actor: 'claude:image-backfill-2026-07-31',
    action: 'events_image_backfill',
    metadata: { candidateCount: rows.length, sourced, placeholder },
  })

  console.log(`${rows.length} event(s): ${sourced} sourced, ${placeholder} placeholder.`)
}

await main()
process.exit(0)
