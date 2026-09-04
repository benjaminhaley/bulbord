import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: 'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Southwest_Virginia_Museum_Artisans_Painting_Class_%2827784079583%29.jpg',
  },
  {
    eventId: '0b85f9b3-a9e7-4d5f-a43c-ba51244f65b6', // Casting on the Pier
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/64/Enjoying_fishing_at_sunrise.jpg',
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
