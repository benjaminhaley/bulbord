import 'dotenv/config'
import { and, gte, inArray, isNull, lte } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Cleans up the real side effect of verifying feedback #131/#132's
// event-sourcing fixes on 2026-09-03: a bug in resourceActiveEventSources()
// (see the sibling "Fix crash in event-sourcing run summary" commit) caused
// the pipeline to be run twice in quick succession against the same 23
// active sources. Both runs actually inserted real events (the bug only
// crashed the final summary-log write, after all per-source inserts had
// already happened) — 134 from the first run, 21 more from the second,
// which should have all deduped against the first run's rows but didn't,
// because extractCandidateEventsFromSource()/simplifyTitle() aren't fully
// deterministic between calls — a second call over the same unchanged page
// text produced slightly different titles for the same real event ("No
// School: PD Day" vs "No School: Professional Development Day", or worse,
// a genuinely truncated fragment like "N"/"No"/"Nettel" from
// simplifyTitle() silently trusting a max_tokens-cut response).
//
// Each pair below was confirmed by hand: same source, same start_date,
// created within minutes of each other, clearly the same real event. The
// fuller/more complete title of each pair is kept; the shorter/truncated
// one is soft-deleted. Every genuinely distinct event on a shared
// source+date (e.g. several different real happy-hour nights at the same
// bar) was left alone.
const DUPLICATE_EVENT_IDS = [
  '7c2c6a33-1b04-485d-a73b-3c6de6839b3a', // "No School: PD Day" — dup of "No School: Professional Development Day" (Sep 25)
  '56624d4b-e2c1-40ee-afcf-2554ab5110b6', // "No School: PD Day" — dup of "No School: Professional Development Day" (Jan 4)
  '3b77ecd1-96ae-4d79-a4f6-130de4924ba0', // "No School: PD Day" — dup of "No School: Professional Development Day" (Feb 23)
  '86233268-7f25-4aab-8276-04c06822aba2', // "Hawthorne Spring Social Fundraiser" — dup of "Hawthorne's Annual Spring Social Fundraiser"
  'f2f75aee-efdc-4ca7-98a9-26dc4d417017', // "Sensory-Friendly Morning" — dup of "Sensory-Friendly Mornings"
  '4d3fb6c1-667f-4a06-a1ad-f2760a6ef4f1', // "ZooLights Member Pre" — truncated dup of "Member Preview Night at ZooLights"
  '2ecebd9c-37ce-4d16-a014-14dc11c188c0', // "Chris White Jazz Trio Tribute to A Charlie Brown Christmas" — dup of "Chris White Jazz Trio: A Charlie Brown Christmas"
  '8339161a-0f8f-443e-8b7d-2b464e658c80', // "N" — truncated dup of "Chicago Nettelhorst French Market"
  'a4536d73-ec70-42a8-92fb-e70502733bb5', // "Nettel" — truncated dup of "Chicago Nettelhorst French Market"
  'e9738ce1-e454-4b60-b260-7d773bcbf188', // "...Session 1 — Storefront Design, Part 1" (em dash) — dup, kept the en-dash version
  '0a995dd9-1e46-4794-ad51-8888c5b8cdb7', // "Harvest Night: Fall Wine" — dup of "Le Sud Harvest Night: Fall Wine Tasting"
  'ca168d68-2d42-4020-84e9-bf74ceeef298', // "Retro on Roscoe" — dup of "Roscoe Village Neighbors: Retro on Roscoe"
  'dd1585c3-ad44-4d81-a0ae-a855e625ef25', // "No" — truncated dup of "No Country for Mothers Screening"
  '936d8a22-f464-42cd-a28c-b6ee448a453c', // "Saint Andrew Oktoberfest &" — truncated dup of "Saint Andrew Parish Oktoberfest & Fall Market"
  'e9bbaed7-52fc-435a-9be4-f6058735515e', // "School Tour & Coffee" — dup of "St Josaphat School Tour & Coffees"
  '02cffd71-0f8f-4b34-b403-d7f71a9d184c', // "Storefront Improvements: Window Displays" — dup of "Business Storefront Improvements: Session 2 – Window Displays"
  '8431b5d1-7108-4576-8939-3ab837ee880a', // "...Session 3 — Quick Holiday Decor Tips" (em dash) — dup, kept the en-dash version
  'b4b700c7-6795-49e1-a548-16be47eaa57f', // "Insect Pinning: Monarch Butterfly" — dup of "...& Chrysalis Vial Making"
  'ef20bffb-2c81-4f50-a270-2813fe1ac595', // "Live Music In Space" — dup of "Live Music"
  '3b4eca5d-a6b4-45e7-be53-7befa2891aa7', // "Movies in The Parking" — truncated dup of "Movies in The Parking Lot: Clue"
  'af9ddd8a-dcec-44c9-b1ca-61e831677eb0', // "Taste of Northalsted 2026 Fall" — truncated dup of "...Food & Drink Sampling Crawl"
]

// The whole test window (both runs), used to scope the bulk-approve step
// below to exactly the events this pass created — not every pending event
// that might exist for other reasons.
const WINDOW_START = new Date('2026-09-03T22:03:00Z')
const WINDOW_END = new Date('2026-09-03T22:13:25Z')

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
      reason: 'soft-deleted near-duplicate/truncated events from re-running event sourcing twice while verifying feedback #131/#132',
      eventIds: deleted.map((e) => e.id),
    },
  })
  console.log(`Soft-deleted ${deleted.length} duplicate events`)

  // Feedback (2026-09-03, following #131/#132): sourced events shouldn't
  // sit in the pending queue at all going forward (see the ingest.ts/
  // resourcing.ts status change landed alongside this script) — applied
  // retroactively here to the real, deduped batch this test pass produced,
  // since leaving them pending while the code now auto-approves everything
  // else would just be an inconsistent leftover.
  const approved = await db
    .update(events)
    .set({ status: 'approved', updatedAt: now })
    .where(and(gte(events.createdAt, WINDOW_START), lte(events.createdAt, WINDOW_END), isNull(events.deletedAt)))
    .returning({ id: events.id })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'bulk-approved the deduped 2026-09-03 event-sourcing test batch, matching the new auto-approve default',
      eventIds: approved.map((e) => e.id),
    },
  })
  console.log(`Approved ${approved.length} events`)
}

await main()
process.exit(0)
