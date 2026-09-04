import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Follow-up to fix-2026-09-04-retro-on-roscoe-image.ts (feedback #152): Ben
// pointed out other events from the same shared listing page
// (lakeviewroscoevillage.org/events-calendar) were still showing the same
// generic Lakeview Roscoe Village Chamber of Commerce logo Retro on Roscoe
// had before that fix — that earlier pass only re-enriched the one event
// named in the feedback, not every other event already sharing the same
// pre-fix image. image-enrichment.ts's isSharedListingPage() check now
// correctly applies to all of these too (confirmed: this source_url is
// shared by many other events), so re-running enrichment sends each one to
// the per-event web image search instead of the generic page/logo.
const EVENT_IDS = [
  'f9632df8-724a-42e7-acb4-9a2a518dde04', // Common Pantry's 15th I Am Your Neighbor Party
  '1c00b039-a462-4c2d-a786-18ab8e5cade2', // Lincoln Brunch Fest
  'c6427e79-aa11-4139-b6e5-a4c981c3a90b', // No Country for Mothers Screening
  '1a56211f-95ec-4fdf-8ee4-996eca80a86d', // Saint Andrew Parish Oktoberfest & Fall Market
  '96bb0c11-5b56-4a7f-ad95-6dd9a1e1295d', // Show & Tell for Grown-Ups
  '4d9fc592-2f7e-42ec-9253-2f451cf9c339', // St Josaphat School Tour & Coffees
  '10e0876d-9724-4fd3-9c2c-3a5d3f536eef', // Wake up with your Pup
]

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const result = await enrichEventImage(row.id, {
      sourceUrl: row.sourceUrl,
      overrideImageUrl: null,
      title: row.title,
      description: row.description,
    })
    console.log(`${row.title}: ${result}`)
  }
}

await main()
process.exit(0)
