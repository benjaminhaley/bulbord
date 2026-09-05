import 'dotenv/config'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Real photo found via do312.com's own dedicated event page (its og:image),
// after gallagherway.com itself turned out to be a full client-rendered SPA
// with no static image reachable by any fetch (confirmed directly — its raw
// HTML is empty except the loader.gif). Viewed before use: shows real
// vendors/shoppers at vintage clothing and jewelry stalls with the actual
// "Wrigleyville Night Market" banner visible in the background — a genuine,
// specific match, not a generic stand-in. Replaces the honest placeholder
// applied earlier after the automated pipeline's own web-search fallback
// (Wikimedia Commons only) came up empty.
const EVENT_IDS = [
  '1a12da32-0500-44d0-b2a1-b1e00a0895ad',
  '68f07e93-c3c8-48c3-bcc2-df5df646dd1b',
  '831593cd-2da5-443d-9511-685d6637ddb0',
  '926c7123-5e97-4c2a-a1f5-8c7b4eb118d9',
  'e607436f-edf9-4d9c-8b33-3e32759a734d',
]
const PHOTO_URL = 'https://assets0.dostuffmedia.com/uploads/aws_asset/aws_asset/31496056/28fe40fb-06e0-4349-a5f1-25b1845ded13.jpg'

async function main() {
  const rows = await db.select({ id: events.id, description: events.description }).from(events).where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const { result } = await enrichEventImage(row.id, {
      sourceUrl: null,
      overrideImageUrl: PHOTO_URL,
      title: 'Wrigleyville Night Market',
      description: row.description,
    })
    console.log(`${row.id}: ${result}`)
  }
}

await main()
process.exit(0)
