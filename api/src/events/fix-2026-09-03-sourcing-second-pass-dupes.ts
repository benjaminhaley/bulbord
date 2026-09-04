import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// A second, deeper duplicate sweep following
// fix-2026-09-03-sourcing-test-dupes-and-approve.ts. That first pass only
// compared events *within* the single 2026-09-03 test batch against each
// other — it missed near-duplicates the same testing created against
// events from *earlier, legitimate* sourcing passes (e.g. "Nettelhorst
// French Market" from 2026-08-22 vs "Chicago Nettelhorst French Market"
// inserted today), and missed a second wave of duplicates from a third
// verification run of the (by-then-fixed) pipeline, which itself produced
// more near-duplicates of the same real events — direct, reproducible
// evidence that this codebase's dedup (exact title + start_date +
// source_url match) is not robust against this model's run-to-run title
// variance (see the ANTHROPIC_API_KEY/temperature investigation in the
// same commit — temperature is not a supported parameter for this model,
// so no sampling-control knob exists to reduce that variance directly).
//
// Every ID below was created 2026-09-03 (today) and was confirmed to
// duplicate a real event already in the table (either an older,
// pre-existing row, or another row from today's own testing) — same
// source_id, same start_date, and unambiguously the same real-world event
// under a different title. Deliberately excludes:
//   - Chicago DOT Block Party Permits' many same-day "Block Party" rows —
//     confirmed real distinct permits at different addresses on the same
//     day, not duplicates (same reasoning as the original
//     fix-2026-08-03-block-party-resourcing-dupes.ts).
//   - Every other same-source/same-date cluster made up of genuinely
//     different real events (e.g. Lakeview East Chamber's several
//     different happy-hour/karaoke nights) — left untouched.
const DUPLICATE_EVENT_IDS = [
  '1c710c94-82d8-4cd6-bbfe-3428325cfbc1', // "HSA Family Fun Fest" — dup of pre-existing "Family Fun Fest"
  '4bb30933-d009-4dc5-8d50-dc756fd6f85b', // "Hawthorne's Spring Social Fundraiser" — dup of today's "Hawthorne's Annual Spring Social Fundraiser"
  '93271c7c-e38a-45f8-9810-54b38660e573', // "Fall Fest" — dup of pre-existing "Fall Fest at Lincoln Park Zoo"
  'dabd6836-7f30-46e6-a63e-fa6c5352abba', // "Spooky Zoo" — dup of pre-existing "Spooky Zoo" (different source_url, same real event)
  'f7722984-72ea-4ab3-81c8-a4e5d191c1da', // "ZooLights Member Preview Night" — dup of today's "Member Preview Night at ZooLights"
  'a8747eb6-629d-4fc9-99c6-646c42d9b82d', // "ZooLights" — dup of pre-existing "ZooLights"
  '0b22c685-8f7d-432f-bcd9-cb55266a3cca', // "Chris White Trio: A Charlie Brown Christmas" — dup of today's "Chris White Jazz Trio: A Charlie Brown Christmas"
  '3b0a66bf-02f8-40f2-8ad0-8f478fb5e1a7', // "Chicago Nettelhorst French Market" (Sep 5) — dup of pre-existing "Nettelhorst French Market"
  '0b3a783a-12ac-4737-8541-84eba99a0693', // same, Sep 12
  '94672247-56d7-4055-8a9a-d85dfde81a4c', // same, Sep 26
  '2ce4102c-7057-4069-a24d-1f929f557a20', // same, Oct 3
  '2b74cead-8f79-4e1c-b584-55eb75f6ae21', // same, Oct 10
  '6f55c8cd-2bfb-4901-87de-bf88edc93eeb', // "Chicago French Market" — a second dup for the same Oct 10 real event
  'ce415f03-11c1-4aef-b658-7badf40dee76', // "Chicago Nettelhorst French Market", Oct 17
  '7cc04c72-08e0-449a-8d1e-7b4a9fcd162b', // same, Oct 24
  '7d197d91-d506-4b44-ad03-602d8085a59b', // same, Oct 31
  '95f5b2c7-7374-4b45-901c-67a42e16f0af', // "Neighborhood Yard Sale 2026" — dup of pre-existing "Southport Neighbors Yard Sale"
  'b0373e47-5f8f-4f43-a225-087c11bbf38f', // "Yard Sale 2026" — a second dup of the same real yard sale
  'fefbf217-836c-424a-b391-d4b973563f29', // "Community Meeting" — dup of pre-existing "Southport Neighbors Meeting"
  '906d20f4-3356-4f25-9661-541932a1b457', // "Quarterly Community Meeting" — a second dup of the same real meeting
  '52ad8137-4dc2-4596-86da-4f1f11d77072', // "Lakeview East Kidical Mass: Lincoln Park Zoo" — dup of pre-existing "Lakeview East Kidical Mass"
  'c3be610c-5e59-4c68-ae9a-f26e4e59dd45', // "Lakeview East Kidical Mass: Halloween Ride" — dup of the same pre-existing ride
  '5836d270-8e98-4af5-a1cb-88aca90fd3bb', // "Kidical Mass: Halloween Ride" — a third dup of the same ride
  '4900e03c-35c5-4430-a525-c18e67070417', // "Low-Line Market" (Sep 8) — dup of pre-existing "Low-Line Market at Southport"
  '389906a1-e139-4d1f-982a-b74b7da8fc14', // same, Sep 15
  'a99e75b8-b697-44ce-90c6-4be27864e3c2', // same, Sep 22
  '1aedb9fd-960f-4f7f-9df5-a177e2359f34', // same, Sep 29
  '70cb9bc9-2cc0-439d-8212-bff08e846c26', // "Taste of SEED Open House" — dup of pre-existing "SEED Cohort Open House"
  '70eb9f65-a23d-4a52-8b98-6570743bccf0', // "Bad Johnny's Wood Oven Pizza" — dup of today's "Bad Johnny's Wood"
  'f43a2379-3fbb-480f-89ed-fb30a99ec1e4', // "Storefront Improvements: Design 1" — dup of today's "Business Storefront Improvements: Session 1 – Storefront Design, Part 1"
  '96531803-d004-45b7-937a-d2a6354f7bce', // "Harvest Night: Fall Wine Tasting" — dup of today's "Le Sud Harvest Night: Fall Wine Tasting"
  'd2bc8c4f-8ca8-4878-be19-8377f3021f09', // "No Country for Mothers: Screening" — dup of today's "No Country for Mothers Screening"
  '30d2cbd0-2318-4c6e-9496-6b7beeb5ca63', // "Saint Andrew Oktoberfest & Fall Market" — dup of today's "Saint Andrew Parish Oktoberfest & Fall Market"
  '4d223d53-a1b9-4006-b225-27e892afadfa', // "Connecting through Touch: Couples" — dup of today's "Connecting through Touch: A Workshop for Couples"
  '080746b5-b4e5-4541-8761-ad04c50f708e', // "School Tour & Coffees" — dup of today's "St Josaphat School Tour & Coffees"
  '5d0a4ab7-0d7a-4557-b686-26fbfb615702', // "Business Storefront Improvements — Session 2: Window Displays" — dup of today's en-dash "Session 2" version
  'd17d45d3-a00a-4fb6-8f21-5a842d0a6122', // "Business Storefront Improvements — Session 3: Quick Holiday Decor Tips" — dup of today's en-dash "Session 3" version
  '2b058bf5-e733-4b5a-9ead-7cc0d40b9941', // "Insect Pinning: Monarch Butterfly & Chrysalis Vial" — dup of today's "...& Chrysalis Vial Making"
  'ce9e42f3-c417-4740-b3d2-ff8140efcdbf', // "A Craft Series: Jeanius" — dup of today's "A Craft Series September: Jeanius"
  'f88db2e3-5e6e-4d5b-ad35-bc7b9f564906', // "Taste of Northalsted Fall" — dup of today's fuller "Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl"
  '30f92f16-f289-4cec-9754-31e6904fa216', // "Library Closed: Labor Day" — dup of today's "Labor Day — Library Closed"
  'ec9329f5-2a55-448f-aafb-5607ec900f1b', // "Library Closed: Thanksgiving Day" — dup of today's "Thanksgiving Day — Library Closed"
  '8b9035b9-b21f-4cd0-9c02-199e0c9c6cdb', // "Library Closed: Christmas Day" — dup of today's "Christmas Day — Library Closed"
  'bffd7287-b3c2-426c-8250-b02a844d4967', // "Field Days" (Jun 10, 2027) — date-drift dup of today's "Field Days" (Jun 9, 2027), same real annual event
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
      reason: 'second-pass dedup: near-duplicates of pre-existing and same-day events, found by cross-checking the whole table rather than only within one test batch',
      eventIds: deleted.map((e) => e.id),
    },
  })

  console.log(`Soft-deleted ${deleted.length} duplicate events (expected ${DUPLICATE_EVENT_IDS.length})`)
}

await main()
process.exit(0)
