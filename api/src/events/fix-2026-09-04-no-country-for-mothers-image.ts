import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Caught during a follow-up visual audit of the Roscoe Village Chamber
// cluster fix: the automated web image search matched "No Country for
// Mothers Screening" to a completely unrelated photo (a Bangladeshi
// political event) — keyword-plausible (the query likely matched on
// generic "screening"/"discussion" terms) but visually wrong, caught only
// by actually opening the file. Replaced with the real, official title
// card from momsfirst.us/doc/, the documentary's own site.
const EVENT_ID = 'c6427e79-aa11-4139-b6e5-a4c981c3a90b' // No Country for Mothers Screening
const IMAGE_URL = 'https://momsfirst.us/wp-content/uploads/2026/05/NCFM_press_release_header_2.png'

async function main() {
  const result = await enrichEventImage(EVENT_ID, { sourceUrl: null, overrideImageUrl: IMAGE_URL })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
