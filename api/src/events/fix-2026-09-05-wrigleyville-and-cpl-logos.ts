import 'dotenv/config'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Two follow-ups to the full-image-sweep audit:
// 1. The 5 "Wrigleyville Night Market" rows had gallagherway.com's own
//    loader.gif (a JS loading spinner, not a logo) as their image — fixed
//    at the root in extract-page-image.ts (UI_CHROME_ASSET_PATTERN); this
//    re-run picks that fix up so siteLogo() stops returning the spinner.
// 2. "Halloween Window Painting" and "Back to School Clothing Swap" were
//    marked 'sourced' by the first sweep pass, but the winning candidate
//    was the plain Chicago Public Library site logo (an isLogo: true
//    candidate, correctly exempt from relevance scoring by design) — Ben
//    asked for logos replaced too, and the automated pipeline's own
//    priority order tries page-extraction (including the logo tier) before
//    ever reaching web search, so simply re-running doesn't get past a
//    logo that's still findable on the page. This re-run isn't expected to
//    fix those two on its own for that reason; kept in this batch anyway to
//    confirm current state before deciding whether a forced web-search-only
//    pass is needed.
const EVENT_IDS = [
  '1a12da32-0500-44d0-b2a1-b1e00a0895ad',
  '68f07e93-c3c8-48c3-bcc2-df5df646dd1b',
  '831593cd-2da5-443d-9511-685d6637ddb0',
  '926c7123-5e97-4c2a-a1f5-8c7b4eb118d9',
  'e607436f-edf9-4d9c-8b33-3e32759a734d',
  'f5a8f60b-13b5-4d40-81f1-3e3714ed3a37',
  '2fed7afa-52bb-44b2-8869-833b653c987c',
]

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const { result, trace } = await enrichEventImage(row.id, {
      sourceUrl: row.sourceUrl,
      overrideImageUrl: null,
      title: row.title,
      description: row.description,
    })
    console.log(`${result}: "${row.title}" (${row.id})`)
    console.log(`  trace: ${JSON.stringify(trace)}`)
  }
}

await main()
process.exit(0)
