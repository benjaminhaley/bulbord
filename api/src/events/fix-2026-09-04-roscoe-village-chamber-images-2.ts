import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Second pass on fix-2026-09-04-roscoe-village-chamber-images.ts: the
// automated web image search came back empty (or, in one case, resolved to
// a completely mismatched file — a Commons file titled "ALL*STAR* BENEFIT
// GALA!" that actually contains unrelated street graffiti, caught by
// actually opening and looking at it) for these 3 of the 7 events. Each
// replacement below was found via a manual Commons search and visually
// verified before use.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: '1c00b039-a462-4c2d-a786-18ab8e5cade2', // Lincoln Brunch Fest
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Jericho_Street_Fair_stalls%2C_2021.jpg',
  },
  {
    eventId: '4d9fc592-2f7e-42ec-9253-2f451cf9c339', // St Josaphat School Tour & Coffees
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/KKW_Open_House_in_2026_09.jpg',
  },
  {
    eventId: 'f9632df8-724a-42e7-acb4-9a2a518dde04', // Common Pantry's 15th I Am Your Neighbor Party
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/be/RWVI_Gala_Dinner%2C_Venice_2019_Congress.jpg',
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
