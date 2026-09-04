import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Ben asked to add "Bike the Drive" (2026-09-04). Verified live via WebFetch
// against bikethedrive.org/event/ and /register/ — the 25th annual event,
// presented by Active Transportation Alliance, is Sunday, September 6, 2026
// (the Sunday before Labor Day, its usual slot): Lake Shore Drive closes to
// cars for a 30-mile car-free loop starting at Grant Park's Butler Field.
// Riding runs 6:30am-10:30am (organizers recommend starting by 8am), with
// full road closure by 11:30am. Registration required — the register page
// didn't list a flat headline price, but its own Family Four Pack breakdown
// implies the standard rate ($69/adult, $18/youth), called out as
// approximate in the description since the page itself says the price rises
// as the date nears.
//
// Filed under a real, dedicated source (bikethedrive.org itself, run by
// Active Transportation Alliance) rather than a one-off/generic bucket —
// same "find the stable host" rule this codebase's other sourcing passes
// follow (CLAUDE.md's Camps checklist item 9) — so the weekly sourcing cron
// can pick up next year's date on its own once the org publishes it, without
// needing another manual add like this one.

const SOURCE_URL = 'https://bikethedrive.org/event/'

const candidate: CandidateEvent = {
  title: 'Bike the Drive',
  description:
    "Lake Shore Drive closes to cars for Chicago's annual car-free ride — a 30-mile loop starting at Grant Park's Butler Field, presented by Active Transportation Alliance. Riding runs 6:30-10:30am (start by 8am to finish the full loop). Registration required, ~$69/adult, ~$18/youth.",
  startDate: '2026-09-06',
  startTime: '06:30',
  allDay: false,
  address: '235 S Columbus Dr, Chicago, IL 60604',
  locationName: 'Grant Park (Butler Field)',
  sourceUrl: SOURCE_URL,
  status: 'approved',
}

async function main() {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, SOURCE_URL)).limit(1)

  const sourceId =
    existing?.id ??
    (
      await db
        .insert(eventSources)
        .values({
          name: 'Bike the Drive — Active Transportation Alliance',
          url: SOURCE_URL,
          type: 'website',
          notes:
            'Annual car-free Lake Shore Drive ride, the Sunday before Labor Day each year. Real per-year page checked live 2026-09-04.',
        })
        .returning({ id: eventSources.id })
    )[0].id

  const result = await ingestEvents([candidate], { sourceId, actor: 'claude:manual-sourcing-2026-09-04' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped.`)

  // CandidateEvent has no topic field (it predates the topic picker — same
  // gap backfill-2026-08-16-topics.ts and the Bike Bus seed both worked
  // around the same way): tag it as a follow-up update.
  await db
    .update(events)
    .set({ topic: 'Sports & Fitness' })
    .where(eq(events.title, 'Bike the Drive'))
}

await main()
process.exit(0)
