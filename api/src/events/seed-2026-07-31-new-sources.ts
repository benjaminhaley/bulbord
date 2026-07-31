import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Ben asked (via Feedback) to add 4 sources: Gallagher Way, Green City
// Market, Chicago Park District events, and Peggy Notebaert Nature Museum —
// and to look in each for real upcoming events. Chicago Park District
// already existed as a source (added 2026-07-29, scoped to Gill/Wendt
// parks); broadened here to also cover its citywide Movies in the Parks
// program. Sourced 2026-07-31 via WebSearch/WebFetch, hand-vetted for real,
// current events; nothing fabricated. Inserted as 'approved' directly
// (rather than the default 'pending') because there's no admin review UI
// yet to work a pending queue — same exception CLAUDE.md documents for the
// 2026-07-29 seed batch.

async function upsertSource(name: string, url: string, type: string, notes: string) {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id

  const [created] = await db.insert(eventSources).values({ name, url, type, notes }).returning({ id: eventSources.id })
  return created.id
}

async function main() {
  const gallagherWayId = await upsertSource(
    'Gallagher Way',
    'https://www.gallagherway.com/',
    'website',
    'Wrigley Field entertainment plaza, 3635 N Clark St. Runs free recurring programming (Toyota Movie Nights, Wrigleyville Night Market) — the site itself is JS-rendered and not fetchable, so verify via news coverage / Eventbrite / do312 instead.',
  )

  const greenCityMarketId = await upsertSource(
    'Green City Market — Lincoln Park',
    'https://www.greencitymarket.org/market/details/lincoln',
    'website',
    "Chicago's sustainable farmers market, 1817 N Clark St. Saturdays & Wednesdays 7am-1pm through Nov 21, 2026.",
  )

  const natureMuseumId = await upsertSource(
    'Peggy Notebaert Nature Museum',
    'https://naturemuseum.org/events',
    'website',
    '2430 N Cannon Dr, Lincoln Park. Family/kid events calendar at naturemuseum.org/events.',
  )

  const [parkDistrict] = await db
    .select()
    .from(eventSources)
    .where(eq(eventSources.url, 'https://www.chicagoparkdistrict.com/'))
    .limit(1)
  if (parkDistrict) {
    await db
      .update(eventSources)
      .set({
        notes:
          'Checked Wendt (Kenneth) Park and Gill Park, both within ~1mi of Nettelhorst. Gill hosts most organized programming for this area; Wendt has none. Also covers the citywide Movies in the Parks program (chicagoparkdistrict.com/movies-parks) — checked 2026-07-31 for screenings near Nettelhorst.',
        updatedAt: new Date(),
      })
      .where(eq(eventSources.id, parkDistrict.id))
  }

  const greenCityMarketCandidates: CandidateEvent[] = [
    {
      title: 'Green City Market — Lincoln Park',
      description: "Chicago's sustainable farmers market — dozens of local farmers and food producers. Saturdays and Wednesdays through Nov 21, 2026.",
      startDate: '2026-08-01',
      startTime: '07:00',
      allDay: false,
      address: '1817 N Clark St, Chicago, IL 60614',
      locationName: 'Green City Market — Lincoln Park',
      sourceUrl: 'https://www.greencitymarket.org/market/details/lincoln',
      status: 'approved',
    },
    {
      title: 'Green City Market — Lincoln Park',
      description: "Chicago's sustainable farmers market — dozens of local farmers and food producers. Saturdays and Wednesdays through Nov 21, 2026.",
      startDate: '2026-08-05',
      startTime: '07:00',
      allDay: false,
      address: '1817 N Clark St, Chicago, IL 60614',
      locationName: 'Green City Market — Lincoln Park',
      sourceUrl: 'https://www.greencitymarket.org/market/details/lincoln',
      status: 'approved',
    },
    {
      title: 'Green City Market — Lincoln Park',
      description: "Chicago's sustainable farmers market — dozens of local farmers and food producers. Saturdays and Wednesdays through Nov 21, 2026.",
      startDate: '2026-08-08',
      startTime: '07:00',
      allDay: false,
      address: '1817 N Clark St, Chicago, IL 60614',
      locationName: 'Green City Market — Lincoln Park',
      sourceUrl: 'https://www.greencitymarket.org/market/details/lincoln',
      status: 'approved',
    },
  ]

  const gallagherWayCandidates: CandidateEvent[] = [
    {
      title: 'Toyota Movie Nights at Gallagher Way: High School Musical',
      description: 'Free outdoor family movie night. Gates open 6pm, movie starts around 7:30pm — bring a blanket or rent a lawn chair.',
      startDate: '2026-08-13',
      startTime: '18:00',
      allDay: false,
      address: '3635 N Clark St, Chicago, IL 60613',
      locationName: 'Gallagher Way',
      sourceUrl: 'https://wgntv.com/news/chicago-news/gallagher-way-announces-2026-summer-events/',
      status: 'approved',
    },
    {
      title: 'Toyota Movie Nights at Gallagher Way: Happy Gilmore',
      description: 'Free outdoor family movie night. Gates open 6pm, movie starts around 7:30pm — bring a blanket or rent a lawn chair.',
      startDate: '2026-08-27',
      startTime: '18:00',
      allDay: false,
      address: '3635 N Clark St, Chicago, IL 60613',
      locationName: 'Gallagher Way',
      sourceUrl: 'https://wgntv.com/news/chicago-news/gallagher-way-announces-2026-summer-events/',
      status: 'approved',
    },
    ...['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27'].map(
      (startDate): CandidateEvent => ({
        title: 'Wrigleyville Night Market',
        description: 'Free weekly night market with 50+ local vendors (vintage clothing, jewelry, home goods) and live music, 4-8pm Thursdays.',
        startDate,
        startTime: '16:00',
        allDay: false,
        address: '3635 N Clark St, Chicago, IL 60613',
        locationName: 'Gallagher Way',
        sourceUrl: 'https://www.gallagherway.com/events/wrigleyville-night-market/',
        status: 'approved',
      }),
    ),
  ]

  const natureMuseumCandidates: CandidateEvent[] = [
    {
      title: 'Casting on the Pier',
      description: "Family fishing activity on the museum's pier, weather permitting. Free with admission.",
      startDate: '2026-08-05',
      startTime: '11:00',
      allDay: false,
      address: '2430 N Cannon Dr, Chicago, IL 60614',
      locationName: 'Peggy Notebaert Nature Museum',
      sourceUrl: 'https://naturemuseum.org/events',
      status: 'approved',
    },
    {
      title: 'Youth Cicada Pinning Workshop',
      description: 'Hands-on cicada pinning workshop for aspiring entomologists, ages 5-17.',
      startDate: '2026-08-08',
      startTime: '10:30',
      allDay: false,
      address: '2430 N Cannon Dr, Chicago, IL 60614',
      locationName: 'Peggy Notebaert Nature Museum',
      sourceUrl: 'https://naturemuseum.org/events',
      status: 'approved',
    },
  ]

  const parkDistrictCandidates: CandidateEvent[] = [
    {
      title: 'Movies in the Parks: Bohemian Rhapsody',
      description: "Free outdoor movie screening in the grass field near the AIDS Garden, at Belmont Harbor. Chicago Park District's Movies in the Parks program.",
      startDate: '2026-08-01',
      startTime: '20:30',
      allDay: false,
      address: 'N Lake Shore Dr & Belmont Ave, Chicago, IL 60657',
      locationName: 'Lincoln Park (Belmont Harbor)',
      sourceUrl: 'https://www.chicagoparkdistrict.com/movies-parks',
      status: 'approved',
    },
  ]

  const results = await Promise.all([
    ingestEvents(greenCityMarketCandidates, { sourceId: greenCityMarketId, actor: 'claude:manual-sourcing' }),
    ingestEvents(gallagherWayCandidates, { sourceId: gallagherWayId, actor: 'claude:manual-sourcing' }),
    ingestEvents(natureMuseumCandidates, { sourceId: natureMuseumId, actor: 'claude:manual-sourcing' }),
    parkDistrict ? ingestEvents(parkDistrictCandidates, { sourceId: parkDistrict.id, actor: 'claude:manual-sourcing' }) : Promise.resolve({ inserted: 0, skipped: 0 }),
  ])

  console.log('Ingest results:', results)
}

await main()
process.exit(0)
