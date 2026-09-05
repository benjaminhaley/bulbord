import 'dotenv/config'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Re-runs enrichment for the events Ben pointed at directly ("These two
// events still just have the building logo again") now that
// image-enrichment.ts's priority order actually tries web search before
// ever falling back to a site logo (previously the logo won immediately
// whenever the page had one, since it was tried before web search and
// never scored). Whatever this produces — a real photo or, if nothing
// exists anywhere, the logo as a genuine last resort — is a real result of
// the fixed pipeline, not a guess.
const EVENT_IDS = [
  'f5a8f60b-13b5-4d40-81f1-3e3714ed3a37', // Halloween Window Painting
  '2f7984ec-a0ed-4bd3-8509-508c25789f5b', // Sunday Crafternoon
  'aef95cb3-34b2-4f38-bd07-3fff18cd7fc4', // Sunday Crafternoon
  'c3ac816a-d8f8-4a81-8748-67de86275e27', // Sunday Crafternoon
]

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const { result, trace } = await enrichEventImage(row.id, {
      sourceUrl: row.sourceUrl,
      overrideImageUrl: null,
      title: row.title,
      description: row.description,
    })
    console.log(`${result}: "${row.title}" (${row.id})`)
    console.log(`  trace: ${JSON.stringify(trace)}`)
  }
}

await main()
process.exit(0)
