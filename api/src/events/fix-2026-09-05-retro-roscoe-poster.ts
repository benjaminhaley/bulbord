import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Roscoe Village Neighbors' own official 2026 event poster
// (roscoevillage.org/join-us-for-retro-on-roscoe/) — real dates (Sep
// 18-19-20) and location (Roscoe & Damen Ave, matching the address already
// fixed for this event) confirmed by viewing the actual downloaded image
// before use, not assumed from the URL alone. Replaces the honest
// placeholder applied earlier after Wikimedia search came up empty.
const EVENT_ID = 'bd3d494d-e7b8-4865-9f73-f137e3f85b88'
const POSTER_URL = 'https://www.roscoevillage.org/wp-content/uploads/2026/07/retro_2026-600x913.jpg'

async function main() {
  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: POSTER_URL,
    title: 'Retro on Roscoe',
    description: row?.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
