import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// "Sesame Street and the Great Elephant Adventure" is a real PBS Nature /
// Sesame Workshop crossover special (Elmo, Abby, and Nina travel to the
// Sheldrick Wildlife Trust in Kenya) — found its own real official press
// still via The Toy Book's coverage (Variety/WTTW/ToughPigs were all
// blocked — paywall/403). Viewed directly: Elmo and an elephant touching
// trunks at sunset, a genuine promotional image for this exact special, not
// a mismatch. Replaces the honest placeholder applied earlier after
// Wikimedia search returned only an unrelated zoo lion photo.
const EVENT_ID = '422f4aec-6543-48cd-a557-0a15031ff631'
const PHOTO_URL = 'https://toybook.com/wp-content/uploads/sites/4/2026/05/PBS_ElmoElephant.jpg'

async function main() {
  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: PHOTO_URL,
    title: 'Sesame Street and the Great Elephant Adventure',
    description: row?.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
