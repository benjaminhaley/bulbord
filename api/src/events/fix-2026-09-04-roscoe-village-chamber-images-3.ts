import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Third and final pass: Wikimedia's upload CDN was rate-limiting this
// sandbox's repeated requests, so both remaining events use real photos from
// the organizers' own sites instead — more specific than a generic Commons
// stock photo anyway. Both verified visually before use.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    // Common Pantry's own real "Save the Date" graphic for this exact
    // event — same date (Oct 2, 2026) and venue (Artifact Events) as our
    // own row, from commonpantry.org's own 2026 announcement post.
    eventId: 'f9632df8-724a-42e7-acb4-9a2a518dde04', // Common Pantry's 15th I Am Your Neighbor Party
    imageUrl: 'https://www.commonpantry.org/wp-content/uploads/2026/08/iayn26_1080x1080.png',
  },
  {
    // A real photo from tellmewhyshow.com (the show's own site) of a real
    // presenter at the actual show, carrying the show's own branding.
    eventId: '96bb0c11-5b56-4a7f-ad95-6dd9a1e1295d', // Show & Tell for Grown-Ups
    imageUrl:
      'https://images.squarespace-cdn.com/content/v1/65f317a73d12147754a5a24d/1780526391396-4WU6ESWDW7RIYETGYRXO/image-asset.jpeg',
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
