import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Swaps in the correct real official flyers (found via a closer look at the
// same Nettelhorst PTO newsletter — the earlier WebFetch summary had
// mislabeled which image belonged to which section).
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    // The real, official "New Family Meet & Greet" flyer — date/time/
    // location match this event's own row exactly.
    eventId: 'c502892d-6990-4169-9366-bd695ed8d8e2', // New Family Meet and Greet
    imageUrl: 'https://mcusercontent.com/e9c0a6f4bd7926e950103a86e/images/78ac21ef-364d-02f6-e312-607feaeaf7ef.png',
  },
  {
    // The real, official "Back to School Bash" flyer — date/time match this
    // event's own row exactly.
    eventId: 'cea71011-6ed2-42c0-a89c-74a1b0ea089a', // Back to School Bash
    imageUrl: 'https://mcusercontent.com/e9c0a6f4bd7926e950103a86e/images/242002dc-6418-be3c-0110-d15e7f631c4b.png',
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
