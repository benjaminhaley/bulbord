import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// "Indoor Kids: Pete's Dragon" never matched movie-poster-lookup.ts's
// MOVIE_NIGHT_TITLE_PATTERN (^Movie Night: ), so it never got the same
// real-poster treatment the Gallagher Way movie nights get — confirmed via
// WebSearch that Music Box Theatre's Indoor Kids series shows the 1977
// original, not the 2016 remake; lookupMoviePoster('Pete\'s Dragon (1977)')
// resolves to the real Wikipedia poster, viewed directly and confirmed
// on-topic before use.
const EVENT_ID = '3b987b47-751a-42cd-9cda-c53947226294'
const POSTER_URL = 'https://upload.wikimedia.org/wikipedia/en/1/1a/Petes_Dragon_movie_poster.jpg'

async function main() {
  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: POSTER_URL,
    title: "Indoor Kids: Pete's Dragon",
    description: row?.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
