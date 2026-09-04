import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Retry pass for the 34 events that got 'none' on the first bulk run —
// Wikimedia's upload CDN rate-limits this sandbox under sustained request
// volume (documented earlier in this same cleanup pass). A small delay
// between each event's own search reduces how often that's hit; anything
// still 'none' after this needs a slower, smaller-batch retry or a manual
// image.
const EVENT_IDS = [
  '95821766-3402-4fdd-8951-84df8d422e9d',
  'cea71011-6ed2-42c0-a89c-74a1b0ea089a',
  '8b3795ee-ac50-4ae0-bece-65cba66b178f',
  '8cc1d555-ceea-47e3-8557-e65c13bc830c',
  'fb643357-6772-490f-bec4-53863ba88a05',
  'c502892d-6990-4169-9366-bd695ed8d8e2',
  '0052f511-8d25-49fe-9991-66383f5685dd',
  'aef95cb3-34b2-4f38-bd07-3fff18cd7fc4',
  'c3ac816a-d8f8-4a81-8748-67de86275e27',
  '14e0d0a2-be09-40b3-a3b8-f3dc34215e9c',
  '8f3dcbbb-cb69-460d-b9e9-661f77952256',
  '6867dcb3-219c-4c26-a73e-01a07fdc1da5',
  'cadb6bd0-693a-4d86-afa7-3e84ab24764a',
  'c3c2b199-6111-4a6c-95ff-755f5f6600c0',
  '5b3d084c-29a3-420e-8c8c-994f5e2fed87',
  '0b85f9b3-a9e7-4d5f-a43c-ba51244f65b6',
  '79803568-7dc3-4b15-a74e-718edf98697e',
  '2aa42db2-f7ba-4f27-a865-7bbf5092d92a',
  'eb32637f-1e00-450a-a81b-18a4ccd50a0b',
  '422f4aec-6543-48cd-a557-0a15031ff631',
  'c407bcfb-9c27-42ac-9c52-901fb5dd6187',
  'fefd46de-5dac-413a-9355-1011e4241563',
  '10d6cd9e-2737-4df0-93dd-d9889bd80d90',
  '6e8d55c1-5b72-4a50-9b7e-ccd194423fc0',
  '311dbe47-2ebf-40d4-8ab8-6a29923bc106',
  'e89c8c83-a6e9-4beb-ae69-52a3610f5b35',
  '29873c7f-60cc-40c2-9f11-413615d60710',
  'de1d7385-680c-4ef5-be15-fc3722141bff',
  'dc43a5c0-f80d-4091-9c86-d6ba260f29ef',
  'b90a9441-28d7-4515-9ab7-b88b09d64261',
  '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0',
  '547c6e5b-f49b-4f4f-a14c-829daeee2919',
  '66ac46c3-58af-43e5-8364-b3a0a25736b8',
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
    const result = await enrichEventImage(row.id, { sourceUrl: null, overrideImageUrl: null, title: row.title, description: row.description })
    console.log(`${row.title}: ${result}`)
    if (result === 'sourced') sourced++
    else none++
    await sleep(1500)
  }
  console.log(`\nDone: ${sourced} sourced, ${none} none.`)
}

await main()
process.exit(0)
