import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Wider cleanup following the Northalsted/Roscoe Village Chamber fixes: an
// audit found 6 more clusters of events sharing one generic host photo
// across different titles — Chicago Public Library Merlo (two separate
// clusters, since chipublib.org and the BiblioCommons event pages are
// different systems), Lincoln Park Zoo, Peggy Notebaert Nature Museum, a
// Mailchimp/campaign-archive newsletter source, and Chicago Park District's
// Movies in the Parks. None of these share a single source_url the way
// Northalsted/Roscoe Village Chamber did — each event has its own distinct
// per-event URL — so image-enrichment.ts's isSharedListingPage() check
// (keyed on exact source_url equality) doesn't catch this shape: it's the
// same *site* producing the same generic branding image on many different
// pages, not one literal shared page. Forcing sourceUrl: null here bypasses
// page-extraction entirely for each of these 40 rows, sending every one
// straight to the per-event web image search instead.
const EVENT_IDS = [
  // CPL Merlo (chipublib.org/locations/51/)
  '311dbe47-2ebf-40d4-8ab8-6a29923bc106', // Adult Book Discussion: The Bell Jar
  'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
  '29873c7f-60cc-40c2-9f11-413615d60710', // Cozy Crafting
  'de1d7385-680c-4ef5-be15-fc3722141bff', // Musical Theater Club
  'dc43a5c0-f80d-4091-9c86-d6ba260f29ef', // Recording Studio Certification for Teens
  'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays
  '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays
  // CPL BiblioCommons cluster 1
  '0a1c0eab-88eb-4edb-b8b3-6d8a63282740', // Baby Time
  '2f7984ec-a0ed-4bd3-8509-508c25789f5b', // Sunday Crafternoon
  // CPL BiblioCommons cluster 2
  '2fed7afa-52bb-44b2-8869-833b653c987c', // Back to School Clothing Swap
  '0052f511-8d25-49fe-9991-66383f5685dd', // Craft Supply Swap
  'f5a8f60b-13b5-4d40-81f1-3e3714ed3a37', // Halloween Window Painting
  'fcc475bc-482d-4615-8321-4dce8cb3cc0a', // Film Screening: Cinderella (1950)
  'aef95cb3-34b2-4f38-bd07-3fff18cd7fc4', // Sunday Crafternoon
  'c3ac816a-d8f8-4a81-8748-67de86275e27', // Sunday Crafternoon
  // Mailchimp newsletter source (Hawthorne-adjacent PTA campaign archive)
  '8cc1d555-ceea-47e3-8557-e65c13bc830c', // Art in the Garden
  'cea71011-6ed2-42c0-a89c-74a1b0ea089a', // Back to School Bash
  'c502892d-6990-4169-9366-bd695ed8d8e2', // New Family Meet and Greet
  '8b3795ee-ac50-4ae0-bece-65cba66b178f', // SEED Cohort Open House
  // Lincoln Park Zoo
  '14e0d0a2-be09-40b3-a3b8-f3dc34215e9c', // Behind-the-Scenes Tour: Regenstein Small Mammal-Reptile House
  'eb32637f-1e00-450a-a81b-18a4ccd50a0b', // Chris White Jazz Trio: A Charlie Brown Christmas
  '66ac46c3-58af-43e5-8364-b3a0a25736b8', // Member Preview Night at ZooLights
  'b90a9441-28d7-4515-9ab7-b88b09d64261', // New Year's ReZoolutions
  '8f3dcbbb-cb69-460d-b9e9-661f77952256', // Penguin Encounter
  '547c6e5b-f49b-4f4f-a14c-829daeee2919', // Sensory-Friendly Mornings
  '422f4aec-6543-48cd-a557-0a15031ff631', // Sesame Street and the Great Elephant Adventure
  'fefd46de-5dac-413a-9355-1011e4241563', // Sharing Wellness and Nature (SWAN)
  'c407bcfb-9c27-42ac-9c52-901fb5dd6187', // Sensory-Friendly Night at ZooLights
  '10d6cd9e-2737-4df0-93dd-d9889bd80d90', // Spring Egg-Stravaganza
  // Peggy Notebaert Nature Museum
  'fb0d1622-2b9f-4309-90ec-b589e1ee91f0', // Casting on the Pier
  '0b85f9b3-a9e7-4d5f-a43c-ba51244f65b6', // Casting on the Pier
  '79803568-7dc3-4b15-a74e-718edf98697e', // C3 Food Sustainability Leadership Training Info Session
  '6867dcb3-219c-4c26-a73e-01a07fdc1da5', // Casting on the Pier
  '6e8d55c1-5b72-4a50-9b7e-ccd194423fc0', // Butterfly Haven Yoga
  'bc6d2c73-40b0-4bef-bb20-9840af3ac257', // Flutter into Fall
  '2aa42db2-f7ba-4f27-a865-7bbf5092d92a', // Insect Pinning: Monarch Butterfly & Chrysalis Vial Making
  'cadb6bd0-693a-4d86-afa7-3e84ab24764a', // Sensory Friendly Morning
  '95821766-3402-4fdd-8951-84df8d422e9d', // Youth Cicada Pinning Workshop
  // Chicago Park District Movies in the Parks
  'c3c2b199-6111-4a6c-95ff-755f5f6600c0', // Movies in the Parks: Star Wars: A New Hope
  '5b3d084c-29a3-420e-8c8c-994f5e2fed87', // Movies in the Parks: The Wizard of Oz
]

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  let sourced = 0
  let none = 0
  for (const row of rows) {
    const result = await enrichEventImage(row.id, { sourceUrl: null, overrideImageUrl: null, title: row.title, description: row.description })
    console.log(`${row.title}: ${result}`)
    if (result === 'sourced') sourced++
    else none++
  }
  console.log(`\nDone: ${sourced} sourced, ${none} none (expected ${EVENT_IDS.length} total, got ${rows.length} rows).`)
}

await main()
process.exit(0)
