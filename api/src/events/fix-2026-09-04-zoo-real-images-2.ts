import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: 'fefd46de-5dac-413a-9355-1011e4241563', // Sharing Wellness and Nature (SWAN)
    imageUrl: 'https://www.lpzoo.org/wp-content/uploads/2022/12/Swan-scaled-1.jpg',
  },
  {
    eventId: 'c407bcfb-9c27-42ac-9c52-901fb5dd6187', // Sensory-Friendly Night at ZooLights
    imageUrl: 'https://www.lpzoo.org/wp-content/uploads/2023/10/ZL-Sensory-Firendly-header-v2.jpg',
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
