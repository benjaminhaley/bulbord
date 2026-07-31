import 'dotenv/config'
import { and, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImages } from './image-enrichment.js'

// One-off backfill, rerunnable: tries to source a real image (og:image etc.)
// for every event still missing one — events that predate image enrichment,
// or that enrichment couldn't find a real image for. No generated-placeholder
// fallback (2026-07-31 feedback removed it) — events this can't find a real
// image for are left with image_url null.
async function main() {
  const rows = await db
    .select({ id: events.id, sourceUrl: events.sourceUrl })
    .from(events)
    .where(and(isNull(events.deletedAt), isNull(events.imageUrl)))

  const { sourced, none } = await enrichEventImages(rows)

  await db.insert(eventsLog).values({
    actor: 'claude:image-backfill-2026-07-31',
    action: 'events_image_backfill',
    metadata: { candidateCount: rows.length, sourced, none },
  })

  console.log(`${rows.length} event(s): ${sourced} sourced, ${none} still without an image.`)
}

await main()
process.exit(0)
