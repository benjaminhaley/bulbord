import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Second retry pass, with a much longer delay between events — Wikimedia's
// upload CDN applies a hard 10-minute rate-limit window under sustained
// load, seen directly via its own retry-after header during this cleanup.
const EVENT_IDS = [
  '311dbe47-2ebf-40d4-8ab8-6a29923bc106', // Adult Book Discussion: The Bell Jar
  'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
  'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays
  '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays
  'cea71011-6ed2-42c0-a89c-74a1b0ea089a', // Back to School Bash
  '8cc1d555-ceea-47e3-8557-e65c13bc830c', // Art in the Garden
  'c502892d-6990-4169-9366-bd695ed8d8e2', // New Family Meet and Greet
  '8b3795ee-ac50-4ae0-bece-65cba66b178f', // SEED Cohort Open House
  '0052f511-8d25-49fe-9991-66383f5685dd', // Craft Supply Swap
  'aef95cb3-34b2-4f38-bd07-3fff18cd7fc4', // Sunday Crafternoon
  'c3ac816a-d8f8-4a81-8748-67de86275e27', // Sunday Crafternoon
  'fb0d1622-2b9f-4309-90ec-b589e1ee91f0', // Casting on the Pier
  '0b85f9b3-a9e7-4d5f-a43c-ba51244f65b6', // Casting on the Pier
  '79803568-7dc3-4b15-a74e-718edf98697e', // C3 Food Sustainability Leadership Training Info Session
  'cadb6bd0-693a-4d86-afa7-3e84ab24764a', // Sensory Friendly Morning
  'eb32637f-1e00-450a-a81b-18a4ccd50a0b', // Chris White Jazz Trio: A Charlie Brown Christmas
  'b90a9441-28d7-4515-9ab7-b88b09d64261', // New Year's ReZoolutions
  'fefd46de-5dac-413a-9355-1011e4241563', // Sharing Wellness and Nature (SWAN)
  '422f4aec-6543-48cd-a557-0a15031ff631', // Sesame Street and the Great Elephant Adventure
  '10d6cd9e-2737-4df0-93dd-d9889bd80d90', // Spring Egg-Stravaganza
  'c407bcfb-9c27-42ac-9c52-901fb5dd6187', // Sensory-Friendly Night at ZooLights
  'c3c2b199-6111-4a6c-95ff-755f5f6600c0', // Movies in the Parks: Star Wars: A New Hope
  '5b3d084c-29a3-420e-8c8c-994f5e2fed87', // Movies in the Parks: The Wizard of Oz
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  let sourced = 0
  let none = 0
  for (const row of rows) {
    const { result } = await enrichEventImage(row.id, { sourceUrl: null, overrideImageUrl: null, title: row.title, description: row.description })
    console.log(`${row.title}: ${result}`)
    if (result === 'sourced') sourced++
    else none++
    await sleep(4000)
  }
  console.log(`\nDone: ${sourced} sourced, ${none} none.`)
}

await main()
process.exit(0)
