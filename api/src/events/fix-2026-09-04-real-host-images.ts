import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Pivoted away from Wikimedia Commons for the rest of this cleanup —
// its upload CDN applies a hard 10-minute rate-limit window under sustained
// load (confirmed via its own retry-after header), which repeatedly
// blocked this cleanup pass. Real photos pulled directly from the actual
// host organizations' own sites instead — more specific/authentic anyway,
// and not subject to that same limit. Each verified visually before use.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    // Peggy Notebaert Nature Museum's own real event-header photo for this
    // exact program (naturemuseum.org/events).
    eventId: '79803568-7dc3-4b15-a74e-718edf98697e', // C3 Food Sustainability Leadership Training Info Session
    imageUrl: 'https://d2rqvd0kuag1qx.cloudfront.net/_640x393_crop_center-center_none/info-session-event-header_2026-02-09-135531_xwhr.jpg',
  },
  {
    // Chicago Park District's own real "Movies in the Parks" banner photo
    // (chicagoparkdistrict.com/movies-parks).
    eventId: 'c3c2b199-6111-4a6c-95ff-755f5f6600c0', // Movies in the Parks: Star Wars: A New Hope
    imageUrl: 'https://files.chicagoparkdistrict.com/styles/full_width_banner/s3/2025-05/2025%20MIP%20Webpage%20Header.jpg',
  },
]

async function main() {
  for (const fix of FIXES) {
    const result = await enrichEventImage(fix.eventId, { sourceUrl: null, overrideImageUrl: fix.imageUrl })
    console.log(`${fix.eventId}: ${result}`)
  }
}

await main()
process.exit(0)
