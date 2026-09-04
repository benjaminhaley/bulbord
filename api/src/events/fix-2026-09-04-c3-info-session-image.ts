import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Feedback #158 screenshot: "C3 Food Sustainability Leadership Training Info
// Session" (a virtual event, naturemuseum.org/events) carried a generic
// photo of C3 volunteers doing an unrelated forest cleanup — a real, sharp,
// correctly-sized photo of the wrong thing, exactly the failure mode the new
// scoreImageRelevance() step (image-relevance.ts) exists to catch. Re-runs
// the real enrichment pipeline (page extraction -> web search, both now
// content-scored) rather than hand-picking a replacement, both to fix this
// event and to verify the new scoring step actually rejects a bad candidate
// and finds something better end-to-end against production data.
const EVENT_ID = '79803568-7dc3-4b15-a74e-718edf98697e'

async function main() {
  const [row] = await db
    .select({ sourceUrl: events.sourceUrl, title: events.title, description: events.description })
    .from(events)
    .where(eq(events.id, EVENT_ID))
  if (!row) throw new Error('Event not found')

  const { result, trace } = await enrichEventImage(EVENT_ID, {
    sourceUrl: row.sourceUrl,
    overrideImageUrl: null,
    title: row.title,
    description: row.description,
  })

  console.log(`Result: ${result}`)
  console.log(JSON.stringify(trace, null, 2))
}

await main()
process.exit(0)
