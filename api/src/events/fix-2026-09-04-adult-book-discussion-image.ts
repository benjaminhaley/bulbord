import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Chicago Public Library's own real Merlo Branch building photo
// (chipublib.org/locations/51/) — a fitting, real image for a book
// discussion held at that specific branch.
const EVENT_ID = '311dbe47-2ebf-40d4-8ab8-6a29923bc106' // Adult Book Discussion: The Bell Jar
const IMAGE_URL = 'https://chipublib.bibliocommons.com/events/uploads/images/full/06608876f5527bb92a2900b878194f6b/merlo-2020.jpg'

async function main() {
  const result = await enrichEventImage(EVENT_ID, { sourceUrl: null, overrideImageUrl: IMAGE_URL })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
