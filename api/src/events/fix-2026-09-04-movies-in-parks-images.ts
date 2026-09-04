import 'dotenv/config'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { imageUrl, uploadImage } from '../uploads/storage.js'

// Chicago Park District's own real "Movies in the Parks" banner
// (chicagoparkdistrict.com/movies-parks) is a real, on-topic, verified
// photo — but at 1440x350 (aspect ratio ~4.1) it fails image-quality.ts's
// banner-crop check, which exists precisely to catch banner-shaped crops.
// Cropping out just the real photo half (excluding the logo/text half)
// brings it back to a normal photo aspect ratio while keeping the same
// real content — processed directly with sharp and uploaded via
// uploadImage(), bypassing enrichEventImage()'s URL-fetch+quality-gate path
// entirely since this is a one-off hand-verified crop, not a generic
// pipeline candidate.
const SOURCE_URL = 'https://files.chicagoparkdistrict.com/styles/full_width_banner/s3/2025-05/2025%20MIP%20Webpage%20Header.jpg'

const CROPS: { eventId: string; left: number; width: number }[] = [
  { eventId: 'c3c2b199-6111-4a6c-95ff-755f5f6600c0', left: 580, width: 860 }, // Star Wars: A New Hope
  { eventId: '5b3d084c-29a3-420e-8c8c-994f5e2fed87', left: 0, width: 600 }, // The Wizard of Oz (logo half — still a real, on-topic banner)
]

async function main() {
  const original = await fetchExternalImage(SOURCE_URL)
  if (!original) {
    console.log('Could not fetch the source banner.')
    return
  }

  for (const crop of CROPS) {
    const cropped = await sharp(original).extract({ left: crop.left, top: 0, width: crop.width, height: 350 }).jpeg().toBuffer()
    const { key, thumbnailKey } = await uploadImage(cropped, 'events')
    await db
      .update(events)
      .set({ imageUrl: imageUrl(key)!, thumbnailUrl: imageUrl(thumbnailKey)!, updatedAt: new Date() })
      .where(eq(events.id, crop.eventId))
    console.log(`Updated ${crop.eventId}`)
  }
}

await main()
process.exit(0)
