import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// The very first real check under the new event_sources.lastContentHash
// mechanism (2026-09-04) had no stored hash to compare against for any
// source, so extraction ran for real everywhere — and, as expected, hit
// the same underlying non-determinism a handful of times (there was no
// hash to skip against on this one run; every run *after* this one is the
// case the fix actually protects). A follow-up run 15 seconds later, once
// hashes were populated, added 0 new events across 19 unchanged sources —
// confirming the fix. These 7 are the real duplicates from that one
// unprotected first run, hand-confirmed against pre-existing events for
// the same source_id + start_date.
const DUPLICATE_EVENT_IDS = [
  '311d31ab-2243-41f8-b2ba-ffb39e1dc52e', // "Kidical Mass: Lincoln Park Zoo" — dup of "Lakeview East Kidical Mass"
  'e9a22102-c2fd-49a4-8055-a158fa5d9f96', // "Virtual C3 Food Sustainability Leadership Training Info Session" — dup of "C3 Food Sustainability Leadership Training Info Session"
  'b4892f96-374c-4f50-b604-24b846026810', // "St Josaphat School Tour" — dup of "St Josaphat School Tour & Coffees"
  'ff9ccac7-d26f-4fad-8c0a-33193ac8f2a6', // "Storefront Improvements: Holiday Decor" — dup of "Business Storefront Improvements: Session 3 – Quick Holiday Decor Tips"
  'c3f91e08-8a18-4675-8612-4d0359a9e331', // "Taste of Northalsted: Fall" — dup of "Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl"
  '52be4db6-249a-4f26-8862-d6166585aa9a', // "Business Storefront Improvements: Session 2 — Window Displays" (em dash) — dup of the en-dash version
  '49538cfc-e8b4-4bc9-a9cc-31c67aeef0e8', // "Storefront Improvements: Design Pt 1" — dup of "Business Storefront Improvements: Session 1 – Storefront Design, Part 1"
]

async function main() {
  const now = new Date()
  const deleted = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, DUPLICATE_EVENT_IDS))
    .returning({ id: events.id })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'duplicates from the first real run under the new lastContentHash mechanism, which had no stored hash yet to skip against',
      eventIds: deleted.map((e) => e.id),
    },
  })

  console.log(`Soft-deleted ${deleted.length} duplicate events (expected ${DUPLICATE_EVENT_IDS.length})`)
}

await main()
process.exit(0)
