import 'dotenv/config'
import { eq, isNull, and } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Ben asked for better pictures on the Gallagher Way "Movie Night: X" events —
// image-enrichment.ts had grabbed the same generic Gallagher Way branding
// graphic for High School Musical/Happy Gilmore, and an even worse tiny
// mommypoppins.com logo strip (258x21) for the two events added in today's
// manual sourcing pass (National Treasure, How to Lose a Guy in 10 Days) —
// all four events share one listing-page source_url with no dedicated image
// per movie, so extraction can't tell them apart. Using each film's real
// official theatrical poster instead, one per movie (Wikipedia-hosted
// low-res fair-use copies — small, but sharp enough for a card/thumbnail).
const POSTERS: { titleMatch: string; imageUrl: string; attribution: string }[] = [
  {
    titleMatch: 'Movie Night: National Treasure',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/1/12/Movie_national_treasure.JPG',
    attribution: 'National Treasure (2004) theatrical release poster, Walt Disney Pictures',
  },
  {
    titleMatch: 'Movie Night: How to Lose a Guy in 10 Days',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/0/07/HowToLoseAGuyimp.jpg',
    attribution: 'How to Lose a Guy in 10 Days (2003) theatrical release poster, Paramount Pictures',
  },
  {
    titleMatch: 'Movie Night: High School Musical',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/a/a5/HSMposter.jpg',
    attribution: 'High School Musical (2006) promotional poster, Disney Channel',
  },
  {
    titleMatch: 'Movie Night: Happy Gilmore',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/en/b/be/Happygilmoreposter.jpg',
    attribution: 'Happy Gilmore (1996) theatrical release poster, Universal Pictures',
  },
]

async function main() {
  const updatedIds: string[] = []

  for (const poster of POSTERS) {
    const response = await fetch(poster.imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download ${poster.imageUrl}: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const { key, thumbnailKey } = await uploadImage(buffer, 'events')

    const updated = await db
      .update(events)
      .set({ imageUrl: imageUrl(key), thumbnailUrl: imageUrl(thumbnailKey), updatedAt: new Date() })
      .where(and(eq(events.title, poster.titleMatch), isNull(events.deletedAt)))
      .returning({ id: events.id })

    console.log(`${poster.titleMatch}: updated ${updated.length} row(s) — ${poster.attribution}`)
    updatedIds.push(...updated.map((e) => e.id))
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: { reason: 'replaced generic Gallagher Way/site-logo images with real movie posters', eventIds: updatedIds },
  })

  console.log(`Total events updated: ${updatedIds.length}`)
}

await main()
process.exit(0)
