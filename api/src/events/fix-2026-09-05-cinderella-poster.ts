import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// "Film Screening: Cinderella (1950)" got a generated placeholder in
// fix-2026-09-05-mismatches-to-placeholder.ts, but this is a real movie
// screening — the same movie-poster-lookup.ts mechanism used for the
// Gallagher Way movie nights applies here too. lookupMoviePoster('Cinderella
// (1950)') resolves to a real period Disney promotional ad ("1950 is the
// Cinderella year... Walt Disney's Cinderella"), viewed directly and
// confirmed as the genuine article's own artwork, not a mismatch.
const EVENT_ID = 'fcc475bc-482d-4615-8321-4dce8cb3cc0a'
const POSTER_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/1950_is_the_Cinderella_year.jpg/330px-1950_is_the_Cinderella_year.jpg'

async function main() {
  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: POSTER_URL,
    title: 'Film Screening: Cinderella (1950)',
    description: row?.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
