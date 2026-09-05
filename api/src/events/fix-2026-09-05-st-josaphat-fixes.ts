import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Two fixes for "St Josaphat School Tour & Coffees", found while chasing a
// real photo per Ben's "keep searching, don't settle for a placeholder"
// directive:
// 1. address was null — the school's own real address (2245 N Southport
//    Ave, Chicago, IL 60614) is publicly published (WebSearch confirmed
//    across GreatSchools/Niche/Yelp) and just never made it into this row.
// 2. Image: six real sources were checked for an actual school-building
//    photo (Wikipedia, the school's own site — Cloudflare-blocked, its
//    Facebook page — only a logo, the Lincoln Park Chamber directory,
//    GreatSchools) and none had one. The parish's own church building
//    (same campus, same address block, a real Wikipedia-documented photo)
//    is used instead — the real physical place this tour's campus centers
//    on, not a wrong/different institution the way the original bug was.
const EVENT_ID = '4d9fc592-2f7e-42ec-9253-2f451cf9c339'
const ADDRESS = '2245 N Southport Ave, Chicago, IL 60614'
const PHOTO_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Saint_Josaphat_Church.jpg/330px-Saint_Josaphat_Church.jpg'

async function main() {
  await db.update(events).set({ address: ADDRESS, updatedAt: new Date() }).where(eq(events.id, EVENT_ID))

  const [row] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_ID))
  const { result } = await enrichEventImage(EVENT_ID, {
    sourceUrl: null,
    overrideImageUrl: PHOTO_URL,
    title: 'St Josaphat School Tour & Coffees',
    description: row?.description,
  })
  console.log(`Image result: ${result}`)
}

await main()
process.exit(0)
