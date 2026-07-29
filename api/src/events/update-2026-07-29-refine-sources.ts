import 'dotenv/config'
import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventSources, eventsLog } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Follow-up to seed-2026-07-29.ts: Ben asked for (1) source_url pointing at the
// specific listing page rather than a hub/homepage, and (2) real descriptions
// pulled from those pages. Re-verified every event via WebSearch/WebFetch against
// its primary source and corrected the ones that were linking to a generic page.

interface Correction {
  title: string
  startDate: string
  newTitle?: string
  sourceUrl: string
  description: string
}

const corrections: Correction[] = [
  {
    title: 'Baby Time',
    startDate: '2026-07-30',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/69f0f6d78ddc1caf5f1fc077',
    description:
      'Join us for 30-minute story times emphasizing adult-child interaction and bonding. Stay for an optional 10-minute play time. For kids 6 to 23 months with a participating adult.',
  },
  {
    title: 'Sunday Crafternoon',
    startDate: '2026-08-02',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/69f123b22866a5b4884b725a',
    description:
      'Beat the Sunday Scaries with a fun and relaxing craft. Create a miniature painting in June, a paper fan in July, and bookmarks in August. All materials are provided. For adults and kids 7 years and up (children under 11 must be accompanied by an adult).',
  },
  {
    title: 'Dine Out on Broadway',
    startDate: '2026-08-21',
    sourceUrl: 'https://lakevieweast.com/dineoutonbroadway/',
    description:
      'Broadway closes to traffic between Belmont and Wellington for expanded outdoor dining — 25+ neighborhood restaurants. Aug 21-23 (Fri 3-11pm, Sat 9am-11pm, Sun 9am-10pm).',
  },
  {
    // Originally seeded as a guess at a generic "Clark Street Festival" — the
    // real 2026 event at this location is a brand-new, differently-named festival.
    title: 'Clark Street Festival',
    startDate: '2026-09-26',
    newTitle: 'Clark Street Live',
    sourceUrl: 'https://lakevieweast.com/meet-clark-street-live-wrigleyvilles-brand-new-music-festival/',
    description:
      "Brand-new music festival closing Clark Street from Addison to Newport for the first time in nearly 30 years. Two stages, festival dining, games, and the Wrigley Field marquee as a backdrop. Runs through Sept 27.",
  },
  {
    title: 'Southport Neighbors Neighborhood Yard Sale',
    startDate: '2026-09-19',
    sourceUrl: 'https://southportneighbors.com/events/yardsale2025/',
    description:
      'Annual neighborhood-wide yard sale across the Southport corridor (Addison to Irving Park, Clark to Ashland). Sign up to sell or just come shop.',
  },
  {
    title: 'Southport Neighbors Quarterly Community Meeting',
    startDate: '2026-10-19',
    sourceUrl: 'https://southportneighbors.com/events/quarterly-community-meeting-5/',
    description:
      'Open quarterly community meeting at Blue Bayou — meet neighbors, hear updates, and weigh in on decisions affecting the Southport area.',
  },
  {
    title: 'Nettelhorst French Market',
    startDate: '2026-08-01',
    sourceUrl: 'https://bensidounusa.com/nettelhorst/',
    description:
      "Lakeview's premiere farmers market, right at the school — produce, flowers, and local vendors. Saturdays 8am-2pm, April 18 through Oct 31 (no market 9/19).",
  },
  {
    title: 'Nettelhorst French Market',
    startDate: '2026-08-08',
    sourceUrl: 'https://bensidounusa.com/nettelhorst/',
    description:
      "Lakeview's premiere farmers market, right at the school — produce, flowers, and local vendors. Saturdays 8am-2pm, April 18 through Oct 31 (no market 9/19).",
  },
  {
    title: 'Nettelhorst French Market',
    startDate: '2026-08-15',
    sourceUrl: 'https://bensidounusa.com/nettelhorst/',
    description:
      "Lakeview's premiere farmers market, right at the school — produce, flowers, and local vendors. Saturdays 8am-2pm, April 18 through Oct 31 (no market 9/19).",
  },
]

const newParkDistrictEvent: CandidateEvent = {
  title: 'Transilience: Chicago Trans Pride Festival at Gill',
  description:
    'Free festival celebrating trans, nonbinary, and gender non-conforming Chicagoans of all ages — dance, drag, music, DJs, circus, puppeteering, comedy, live painting, and more. All ages welcome.',
  startDate: '2026-08-14',
  startTime: '18:00',
  allDay: false,
  address: '825 W Sheridan Rd, Chicago, IL 60613',
  latitude: '41.954018',
  longitude: '-87.648283',
  sourceUrl: 'https://www.chicagoparkdistrict.com/events/transilience-chicago-trans-pride-festival-gill',
  status: 'approved',
}

async function upsertSource(name: string, url: string, notes: string) {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(eventSources)
    .values({ name, url, type: 'website', notes })
    .returning({ id: eventSources.id })
  return created.id
}

async function main() {
  let corrected = 0
  for (const fix of corrections) {
    const result = await db
      .update(events)
      .set({
        ...(fix.newTitle ? { title: fix.newTitle } : {}),
        sourceUrl: fix.sourceUrl,
        description: fix.description,
      })
      .where(and(eq(events.title, fix.title), eq(events.startDate, fix.startDate)))
      .returning({ id: events.id })
    corrected += result.length
  }

  const parkDistrictSourceId = await upsertSource(
    'Chicago Park District — nearby parks',
    'https://www.chicagoparkdistrict.com/',
    'Checked Wendt (Kenneth) Park and Gill Park, both within ~1mi of Nettelhorst. Gill hosts most organized programming for this area; Wendt has none.',
  )

  await upsertSource(
    'Chicago Parent Magazine',
    'https://www.chicagoparent.com/',
    'Added 2026-07-29. A few nearby leads (Southport Holiday Stroll, Lakeview East Oktoberfest) lack a confirmed 2026 date as of this crawl — revisit once dates are published rather than guess.',
  )

  const ingestResult = await ingestEvents([newParkDistrictEvent], {
    sourceId: parkDistrictSourceId,
    actor: 'claude:manual-sourcing-2026-07-29',
  })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing-2026-07-29',
    action: 'events_sources_refined',
    metadata: { correctedCount: corrected, addedSources: ['Chicago Park District', 'Chicago Parent Magazine'] },
  })

  console.log(`Corrected ${corrected} events. Ingested ${ingestResult.inserted} new event(s) from Park District.`)
}

await main()
process.exit(0)
