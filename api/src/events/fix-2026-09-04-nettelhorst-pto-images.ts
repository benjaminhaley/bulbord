import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// These 4 events turned out to come from Nettelhorst's OWN PTO newsletter
// (us5.campaign-archive.com) — real, official graphics for the exact events,
// found by fetching the newsletter itself and verified visually.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    // The actual official "Art in the Garden" flyer graphic, matching this
    // event's own date/time/location (Aug 15, 10am-12pm, Kinder Garden).
    eventId: '8cc1d555-ceea-47e3-8557-e65c13bc830c', // Art in the Garden
    imageUrl: 'https://mcusercontent.com/e9c0a6f4bd7926e950103a86e/images/a14891a7-f7e3-d81a-85b9-410592178a4b.png',
  },
  {
    // The real "SEED @ Nettelhorst School" program logo.
    eventId: '8b3795ee-ac50-4ae0-bece-65cba66b178f', // SEED Cohort Open House
    imageUrl: 'https://mcusercontent.com/e9c0a6f4bd7926e950103a86e/images/289d1cda-e979-9afb-c46e-a07942f03bb6.jpg',
  },
  {
    // A welcoming/community graphic from the same newsletter.
    eventId: 'c502892d-6990-4169-9366-bd695ed8d8e2', // New Family Meet and Greet
    imageUrl: 'https://mcusercontent.com/e9c0a6f4bd7926e950103a86e/images/58d53004-c108-1fb4-0aa9-a45a23a6b009.jpeg',
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
