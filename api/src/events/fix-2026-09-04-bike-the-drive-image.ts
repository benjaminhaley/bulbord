import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// The image-enrichment pipeline's page-extraction candidates for
// bikethedrive.org/event/ all turned out to be off-topic (its highest-
// priority extractable image is a weather-alert-level legend graphic, not a
// photo of the actual ride) — caught by actually opening and looking at the
// uploaded file, the same "quality-gate-pass isn't proof of relevance"
// lesson CLAUDE.md's Sports & Clubs sourcing checklist already documents.
// Wikipedia's own "Bike the Drive" article has a real, on-topic photo
// (cyclists on a closed Lake Shore Drive, Chicago skyline behind them) —
// verified directly before using it, same as movie-poster-lookup.ts's
// keyless Wikipedia pattern, just applied by hand this once rather than as
// a reusable subject-specific lookup (this is a one-off manual add, not a
// recurring per-occurrence ambiguity like the movie-night case).
const OVERRIDE_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/9/90/Bike_the_Drive_ride_Chicago_2022.jpg'

async function main() {
  const [event] = await db.select({ id: events.id }).from(events).where(eq(events.title, 'Bike the Drive')).limit(1)
  if (!event) {
    console.log('No "Bike the Drive" event found.')
    return
  }

  const result = await enrichEventImage(event.id, { sourceUrl: null, overrideImageUrl: OVERRIDE_IMAGE_URL })
  console.log(`Image enrichment result: ${result}`)
}

await main()
process.exit(0)
