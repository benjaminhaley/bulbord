import 'dotenv/config'
import { inArray } from 'drizzle-orm'
import sharp from 'sharp'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// CPL's own real "Crafts, Games and Play" category graphic (used elsewhere
// on chipublib.bibliocommons.com for teen gaming programs) is legitimately
// on-brand for Power Up Thursdays — but at 760x230 (aspect ratio ~3.3) it
// fails image-quality.ts's banner-crop check via the normal
// enrichEventImage() override path (which always treats an override as a
// non-logo candidate). Cropped directly with sharp to isolate the real owl
// mascot artwork at a normal aspect ratio, then uploaded via uploadImage()
// directly — a one-off hand-verified crop, not a generic pipeline
// candidate. Both occurrences share it (same recurring program, same
// convention as other recurring series in this app).
const SOURCE_URL = 'https://chipublib.bibliocommons.com/events/uploads/images/full/bddb721a0da3c4827398fc08be3e1541/CraftsGamesandPlay.png'
const EVENT_IDS = ['e89c8c83-a6e9-4beb-ae69-52a3610f5b35', '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0']

async function main() {
  const original = await fetchExternalImage(SOURCE_URL)
  if (!original) {
    console.log('Could not fetch the source graphic.')
    return
  }

  const cropped = await sharp(original).extract({ left: 400, top: 0, width: 230, height: 230 }).png().toBuffer()
  const { key, thumbnailKey } = await uploadImage(cropped, 'events')

  const updated = await db
    .update(events)
    .set({ imageUrl: imageUrl(key)!, thumbnailUrl: imageUrl(thumbnailKey)!, updatedAt: new Date() })
    .where(inArray(events.id, EVENT_IDS))
    .returning({ id: events.id, title: events.title })

  console.log(`Updated ${updated.length} events: ${updated.map((e) => e.title).join(', ')}`)
}

await main()
process.exit(0)
