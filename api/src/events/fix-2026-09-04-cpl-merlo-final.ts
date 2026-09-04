import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// CPL's own real "Crafts, Games and Play" category graphic (used elsewhere
// on chipublib.bibliocommons.com for teen gaming programs) — legitimately
// on-brand for Power Up Thursdays specifically. Both occurrences share it
// since they're the same recurring program (same convention as other
// recurring series in this app).
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: 'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays
    imageUrl: 'https://chipublib.bibliocommons.com/events/uploads/images/full/bddb721a0da3c4827398fc08be3e1541/CraftsGamesandPlay.png',
  },
  {
    eventId: '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays
    imageUrl: 'https://chipublib.bibliocommons.com/events/uploads/images/full/bddb721a0da3c4827398fc08be3e1541/CraftsGamesandPlay.png',
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
