import 'dotenv/config'
import { and, isNull, like } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Ben asked for a better image on the block-party events — enrichment had
// grabbed the Chicago Data Portal's own logo (the last-resort "site branding"
// fallback in image-enrichment.ts), since source_url points at a dataset page
// with no event-specific image of its own. Using one shared, real photo
// instead: "Block Party" by Seattle Parks & Recreation (Flickr, CC BY 2.0) —
// kids playing on a closed residential street, a generic but genuine
// block-party scene (not Chicago-specific, since none of these 19 permits
// have their own individual photo anywhere public).
const IMAGE_URL = 'https://live.staticflickr.com/65535/48672949398_595e3e9546_b.jpg'
const ATTRIBUTION = '"Block Party" by Seattle Parks & Recreation, CC BY 2.0 (flickr.com/photos/48268815@N02/48672949398)'

async function main() {
  const response = await fetch(IMAGE_URL)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const { key, thumbnailKey } = await uploadImage(buffer, 'events')

  const updated = await db
    .update(events)
    .set({ imageUrl: imageUrl(key)!, thumbnailUrl: imageUrl(thumbnailKey)!, updatedAt: new Date() })
    .where(and(like(events.title, 'Block Party:%'), isNull(events.deletedAt)))
    .returning({ id: events.id })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: { reason: 'better block-party image per Feedback', attribution: ATTRIBUTION, eventIds: updated.map((e) => e.id) },
  })

  console.log(`Updated ${updated.length} block-party events with image ${imageUrl(key)}`)
}

await main()
process.exit(0)
