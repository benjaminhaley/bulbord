import 'dotenv/config'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Feedback #155/#156/#157 (2026-09-04) — three real listings that survived
// extraction despite the audience-relevance rules already having language
// that should have caught two of them. See extraction-filters.ts and the new
// candidate-validation.ts second pass for the going-forward systemic fix;
// this script is just the one-time cleanup of the three specific rows.
//
// - "A Craft Series September: Jeanius" (#155): only location given anywhere
//   is "Northalsted" — a whole business district, not a place a person could
//   navigate to. Checked directly: the source page (northalsted.com/upcoming/)
//   gives no address for this listing either; a web search confirms "A Craft
//   Series" is a real recurring Northalsted Business Alliance program
//   (Chicago's Craft Kings, instructors Pagina/Lúc Ami), but no specific
//   venue address is published anywhere findable. Per Ben's own framing
//   ("what if I wanna go there, how would I get there right now?"), removed
//   rather than kept with a guessed or still-vague location.
// - "Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl" (#156): the
//   source page itself categorizes this under "Bar Crawl" — confirming it's
//   exactly the crawl format the strengthened rule now excludes, not a
//   single-site festival like Market Days.
// - "Sharing Wellness and Nature (SWAN)" (#157): the listing's own
//   description states "adults (18+)" explicitly — an age-restricted
//   program, regardless of Lincoln Park Zoo otherwise being a reliably
//   family-friendly venue.
const REMOVE_EVENT_IDS = [
  '1151b890-fccc-4342-bfeb-c74f8b35581f', // A Craft Series September: Jeanius
  'c0041aad-206e-4ded-b069-6b4c48306ae5', // Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl
  'fefd46de-5dac-413a-9355-1011e4241563', // Sharing Wellness and Nature (SWAN)
]

async function main() {
  const now = new Date()

  const removed = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, REMOVE_EVENT_IDS))
    .returning({ id: events.id, title: events.title })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'feedback #155/#156/#157: removed a vague-location listing (only "Northalsted," a whole district, given anywhere), a bar/drink crawl mislabeled as a neighborhood festival, and an explicitly 18+ program — see extraction-filters.ts and candidate-validation.ts for the going-forward systemic fix',
      eventIds: removed.map((e) => e.id),
    },
  })

  console.log(`Soft-deleted ${removed.length} events (expected ${REMOVE_EVENT_IDS.length}):`)
  for (const e of removed) console.log(`  - ${e.title}`)
}

await main()
process.exit(0)
