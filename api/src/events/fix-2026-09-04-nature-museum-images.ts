import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: 'cadb6bd0-693a-4d86-afa7-3e84ab24764a', // Sensory Friendly Morning
    imageUrl: 'https://d2rqvd0kuag1qx.cloudfront.net/header.jpg',
  },
  {
    eventId: 'fb0d1622-2b9f-4309-90ec-b589e1ee91f0', // Casting on the Pier
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Fishing_2.jpg',
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
