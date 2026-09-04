import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventSources } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Feedback #146/#150/#153 (2026-09-04): 8 different events sourced from
// Northalsted Business Alliance's generic https://northalsted.com/upcoming/
// listing page all ended up with the exact same (inappropriate) image —
// confirmed byte-identical via checksum. Root cause and systemic fix are in
// image-enrichment.ts's new isSharedListingPage() check. This re-runs
// enrichment for each already-affected event now that the fix is live
// locally — since all 8 still share the same source_url, the new check
// correctly skips page-extraction for every one of them and falls through to
// the per-event web image search instead.

async function main() {
  const [source] = await db.select({ id: eventSources.id }).from(eventSources).where(eq(eventSources.name, 'Northalsted Business Alliance'))
  if (!source) {
    console.log('Northalsted Business Alliance source not found.')
    return
  }

  const affected = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(and(eq(events.sourceId, source.id), isNull(events.deletedAt)))

  for (const event of affected) {
    const result = await enrichEventImage(event.id, {
      sourceUrl: event.sourceUrl,
      overrideImageUrl: null,
      title: event.title,
      description: event.description,
    })
    console.log(`${event.title}: ${result}`)
  }
}

await main()
process.exit(0)
