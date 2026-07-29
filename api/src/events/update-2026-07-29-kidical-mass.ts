import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Ben flagged that the bike bus also has a monthly family ride, which I'd
// missed. It's actually published by Chicago Family Biking (a separate,
// citywide org from the Nettelhorst Bike Bus Instagram) — their "Lakeview
// East Kidical Mass" meets at Nettelhorst monthly. Verified via WebFetch
// against chicagofamilybiking.org/events; no per-event permalink exists yet
// for the Aug instance, so source_url points at the events page itself.

const candidate: CandidateEvent = {
  title: 'Lakeview East Kidical Mass',
  description:
    "Family bike ride to Margaret Donahue Park's splash pad. Meet 9:00am, roll 9:15am from Nettelhorst's front playlot. Led by Christina Hayford & Peter Compernolle. Rain or shine.",
  startDate: '2026-08-29',
  startTime: '09:00',
  allDay: false,
  address: '3252 N Broadway, Chicago, IL 60657',
  latitude: '41.941489',
  longitude: '-87.645136',
  sourceUrl: 'http://www.chicagofamilybiking.org/events',
  status: 'approved',
}

async function main() {
  const [existing] = await db
    .select()
    .from(eventSources)
    .where(eq(eventSources.url, 'http://www.chicagofamilybiking.org/events'))
    .limit(1)

  const sourceId =
    existing?.id ??
    (
      await db
        .insert(eventSources)
        .values({
          name: 'Chicago Family Biking',
          url: 'http://www.chicagofamilybiking.org/events',
          type: 'website',
          notes: 'Publishes the Lakeview East Kidical Mass, a recurring monthly family ride that meets at Nettelhorst.',
        })
        .returning({ id: eventSources.id })
    )[0].id

  const result = await ingestEvents([candidate], { sourceId, actor: 'claude:manual-sourcing-2026-07-29' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped.`)
}

await main()
process.exit(0)
