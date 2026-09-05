import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Lincoln Park Zoo's own exhibit page (lpzoo.org/exhibits/regenstein-small-
// mammal-reptile-house/) has a real hero banner photo of the actual
// building entrance, sign and all — found by fetching the raw page HTML
// directly rather than relying on generic Wikimedia search, which had
// returned an unrelated band photo. Viewed before use.
const EVENT_ID = '14e0d0a2-be09-40b3-a3b8-f3dc34215e9c'
const PHOTO_URL = 'https://www.lpzoo.org/wp-content/uploads/2022/12/ex_b4_Banner-5.jpg'

async function main() {
  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: PHOTO_URL,
    title: 'Behind-the-Scenes Tour: Regenstein Small Mammal-Reptile House',
    description: row?.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
