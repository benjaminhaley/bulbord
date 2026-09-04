import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Real photos from each event's own dedicated lpzoo.org page — verified
// visually before use.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: '422f4aec-6543-48cd-a557-0a15031ff631', // Sesame Street and the Great Elephant Adventure
    imageUrl: 'https://www.lpzoo.org/wp-content/uploads/2026/08/lion-and-baby-header.jpg',
  },
  {
    eventId: 'eb32637f-1e00-450a-a81b-18a4ccd50a0b', // Chris White Jazz Trio: A Charlie Brown Christmas
    imageUrl: 'https://www.lpzoo.org/wp-content/uploads/2023/10/banner.png',
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
