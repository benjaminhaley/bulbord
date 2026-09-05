import 'dotenv/config'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Remaining flagged events from the full-image-sweep audit (2026-09-05),
// after Bike Bus (fix-2026-09-05-bike-bus-real-photo.ts, one shared real
// photo applied across all occurrences) and the flyer/C3 categories Ben
// asked to leave alone. Re-runs the real enrichEventImage() pipeline fresh
// (overrideImageUrl: null) for each — letting page-extraction (now correctly
// skipped when it would just re-return a shared/logo candidate, or scored
// and rejected if it does run) and the web-search fallback (now content-
// scored) find something better, exactly the mechanism every future
// automated re-scrape now benefits from. Not a mass DB write — every
// replacement still goes through the same download/quality/relevance gates
// as a brand-new event would.
const EVENT_IDS = [
  '311dbe47-2ebf-40d4-8ab8-6a29923bc106', // Adult Book Discussion: The Bell Jar
  '2fed7afa-52bb-44b2-8869-833b653c987c', // Back to School Clothing Swap
  '14e0d0a2-be09-40b3-a3b8-f3dc34215e9c', // Behind-the-Scenes Tour: Regenstein
  '6e8d55c1-5b72-4a50-9b7e-ccd194423fc0', // Butterfly Haven Yoga
  '6867dcb3-219c-4c26-a73e-01a07fdc1da5', // Casting on the Pier
  '0b85f9b3-a9e7-4d5f-a43c-ba51244f65b6', // Casting on the Pier
  '0052f511-8d25-49fe-9991-66383f5685dd', // Craft Supply Swap
  'fcc475bc-482d-4615-8321-4dce8cb3cc0a', // Film Screening: Cinderella (1950)
  'bc6d2c73-40b0-4bef-bb20-9840af3ac257', // Flutter into Fall
  'f5a8f60b-13b5-4d40-81f1-3e3714ed3a37', // Halloween Window Painting
  'b67c7e70-f842-41cf-8725-78390212ec47', // Haunted Halsted
  '3b987b47-751a-42cd-9cda-c53947226294', // Indoor Kids: Pete's Dragon
  'e2f99abf-1300-4481-9911-73109f8f2679', // Lakeview East Kidical Mass
  '774a99ce-a38c-43d5-a9da-e0fbb01f594d', // Lakeview East Kidical Mass
  'd7b534cd-5fe9-4f1a-9d51-e15922506ac1', // Lakeview East Kidical Mass
  '66ac46c3-58af-43e5-8364-b3a0a25736b8', // Member Preview Night at ZooLights
  '5b3d084c-29a3-420e-8c8c-994f5e2fed87', // Movies in the Parks: The Wizard of Oz
  'de1d7385-680c-4ef5-be15-fc3722141bff', // Musical Theater Club
  '20a76eb9-3492-4ba2-98b0-6296869354f1', // Northalsted Market Days
  '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays
  'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays
  'bd3d494d-e7b8-4865-9f73-f137e3f85b88', // Retro on Roscoe
  '8b3795ee-ac50-4ae0-bece-65cba66b178f', // SEED Cohort Open House
  '1a56211f-95ec-4fdf-8ee4-996eca80a86d', // Saint Andrew Parish Oktoberfest & Fall Market
  'cadb6bd0-693a-4d86-afa7-3e84ab24764a', // Sensory Friendly Morning
  '422f4aec-6543-48cd-a557-0a15031ff631', // Sesame Street and the Great Elephant Adventure
  '4c0ed623-7a94-4c27-9e18-200e890efbc1', // Southport Neighbors Meeting
  '4d9fc592-2f7e-42ec-9253-2f451cf9c339', // St Josaphat School Tour & Coffees
  '2f7984ec-a0ed-4bd3-8509-508c25789f5b', // Sunday Crafternoon
  'aef95cb3-34b2-4f38-bd07-3fff18cd7fc4', // Sunday Crafternoon
  'c3ac816a-d8f8-4a81-8748-67de86275e27', // Sunday Crafternoon
  '1a12da32-0500-44d0-b2a1-b1e00a0895ad', // Wrigleyville Night Market
  '68f07e93-c3c8-48c3-bcc2-df5df646dd1b', // Wrigleyville Night Market
  '831593cd-2da5-443d-9511-685d6637ddb0', // Wrigleyville Night Market
  '926c7123-5e97-4c2a-a1f5-8c7b4eb118d9', // Wrigleyville Night Market
  'e607436f-edf9-4d9c-8b33-3e32759a734d', // Wrigleyville Night Market
  '95821766-3402-4fdd-8951-84df8d422e9d', // Youth Cicada Pinning Workshop
]

const CONCURRENCY = 4

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  console.log(`Re-enriching ${rows.length} events...\n`)

  let index = 0
  let sourced = 0
  let none = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      const { result, trace } = await enrichEventImage(row.id, {
        sourceUrl: row.sourceUrl,
        overrideImageUrl: null,
        title: row.title,
        description: row.description,
      })
      if (result === 'sourced') sourced++
      else none++
      console.log(`${result === 'sourced' ? 'FIXED' : 'STILL NONE'}: "${row.title}" (${row.id})`)
      if (result !== 'sourced') console.log(`  trace: ${JSON.stringify(trace)}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

  console.log(`\nDone. ${sourced} re-sourced, ${none} still unresolved out of ${rows.length}.`)
}

await main()
process.exit(0)
