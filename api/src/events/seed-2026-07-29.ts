import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Sourced 2026-07-29 via WebSearch, hand-vetted for real, current, upcoming events
// within ~1 mile of Nettelhorst School (3252 N Broadway, Chicago, IL 60657).
// Every source_url is a real page confirming the event; nothing fabricated.
const candidates: CandidateEvent[] = [
  {
    title: 'Nettelhorst French Market',
    description: 'Weekly farmers market at the school, Saturdays through Oct 31, 2026.',
    startDate: '2026-08-01',
    startTime: '08:00',
    allDay: false,
    address: '3252 N Broadway, Chicago, IL 60657',
    latitude: '41.941489',
    longitude: '-87.645136',
    sourceUrl: 'https://www.domu.com/blog/farmers-markets-chicago-2026-neighborhoods-schedule',
    status: 'approved',
  },
  {
    title: 'Nettelhorst French Market',
    description: 'Weekly farmers market at the school, Saturdays through Oct 31, 2026.',
    startDate: '2026-08-08',
    startTime: '08:00',
    allDay: false,
    address: '3252 N Broadway, Chicago, IL 60657',
    latitude: '41.941489',
    longitude: '-87.645136',
    sourceUrl: 'https://www.domu.com/blog/farmers-markets-chicago-2026-neighborhoods-schedule',
    status: 'approved',
  },
  {
    title: 'Nettelhorst French Market',
    description: 'Weekly farmers market at the school, Saturdays through Oct 31, 2026.',
    startDate: '2026-08-15',
    startTime: '08:00',
    allDay: false,
    address: '3252 N Broadway, Chicago, IL 60657',
    latitude: '41.941489',
    longitude: '-87.645136',
    sourceUrl: 'https://www.domu.com/blog/farmers-markets-chicago-2026-neighborhoods-schedule',
    status: 'approved',
  },
  {
    title: 'Baby Time',
    description: 'Stories, songs, and playtime for babies, at Merlo Branch Library.',
    startDate: '2026-07-30',
    startTime: '10:30',
    allDay: false,
    address: '644 W Belmont Ave, Chicago, IL 60657',
    latitude: '41.940342',
    longitude: '-87.646212',
    sourceUrl: 'https://www.chipublib.org/locations/51/',
    status: 'approved',
  },
  {
    title: 'Sunday Crafternoon',
    description: 'Drop-in craft program for kids, at Merlo Branch Library.',
    startDate: '2026-08-02',
    startTime: '13:30',
    allDay: false,
    address: '644 W Belmont Ave, Chicago, IL 60657',
    latitude: '41.940342',
    longitude: '-87.646212',
    sourceUrl: 'https://www.chipublib.org/locations/51/',
    status: 'approved',
  },
  {
    title: 'Low-Line Market at Southport',
    description: 'Weekly farmers/artisan market under the Southport CTA tracks, Tuesdays through Sept 29, 2026.',
    startDate: '2026-08-04',
    startTime: '15:00',
    allDay: false,
    address: 'Southport Ave & Newport Ave (CTA Southport station), Chicago, IL 60657',
    latitude: '41.943849',
    longitude: '-87.663579',
    sourceUrl: 'https://southportcorridorchicago.com/2026/04/28/chicagos-low-line-market-returns-for-2026-season-beneath-southport-corridor-tracks/',
    status: 'approved',
  },
  {
    title: 'Low-Line Market at Southport',
    description: 'Weekly farmers/artisan market under the Southport CTA tracks, Tuesdays through Sept 29, 2026.',
    startDate: '2026-08-11',
    startTime: '15:00',
    allDay: false,
    address: 'Southport Ave & Newport Ave (CTA Southport station), Chicago, IL 60657',
    latitude: '41.943849',
    longitude: '-87.663579',
    sourceUrl: 'https://southportcorridorchicago.com/2026/04/28/chicagos-low-line-market-returns-for-2026-season-beneath-southport-corridor-tracks/',
    status: 'approved',
  },
  {
    title: 'Low-Line Market at Southport',
    description: 'Weekly farmers/artisan market under the Southport CTA tracks, Tuesdays through Sept 29, 2026.',
    startDate: '2026-08-18',
    startTime: '15:00',
    allDay: false,
    address: 'Southport Ave & Newport Ave (CTA Southport station), Chicago, IL 60657',
    latitude: '41.943849',
    longitude: '-87.663579',
    sourceUrl: 'https://southportcorridorchicago.com/2026/04/28/chicagos-low-line-market-returns-for-2026-season-beneath-southport-corridor-tracks/',
    status: 'approved',
  },
  {
    title: 'Northalsted Market Days',
    description: 'Street festival on Halsted between Addison and Belmont — live music, 250+ vendors. Runs through Aug 9.',
    startDate: '2026-08-07',
    startTime: '17:00',
    allDay: false,
    address: 'Halsted St between Addison St & Belmont Ave, Chicago, IL 60657',
    latitude: '41.947238',
    longitude: '-87.648971',
    sourceUrl: 'https://northalsted.com/events/northalsted-market-days-2026/',
    status: 'approved',
  },
  {
    title: 'Dine Out on Broadway',
    description: 'Broadway closes to traffic from Belmont to Wellington for outdoor dining. Runs through Aug 23.',
    startDate: '2026-08-21',
    startTime: '15:00',
    allDay: false,
    address: 'N Broadway between W Belmont Ave & W Wellington Ave, Chicago, IL 60657',
    sourceUrl: 'https://lakevieweast.com/2026-chamber-annual-events/',
    status: 'approved',
  },
  {
    title: 'Lakeview Taco Fest',
    description: 'Neighborhood taco festival along the Southport Corridor — 10+ restaurants, live music. Runs through Aug 23.',
    startDate: '2026-08-21',
    allDay: true,
    address: 'Southport Ave, Chicago, IL 60657 (Southport Corridor)',
    latitude: '41.943682',
    longitude: '-87.664031',
    sourceUrl: 'https://www.eventeny.com/events/lakeview-taco-fest-2026-28248/',
    status: 'approved',
  },
  {
    title: 'Lakeview East Festival of the Arts',
    description: '100+ artists on North Broadway, plus live music and food. Runs through Sept 20.',
    startDate: '2026-09-19',
    startTime: '11:00',
    allDay: false,
    address: 'N Broadway, Chicago, IL 60657',
    sourceUrl: 'https://www.choosechicago.com/event/annual-lakeview-east-festival-of-the-arts/2026-09-19/',
    status: 'approved',
  },
  {
    title: 'Southport Neighbors Neighborhood Yard Sale',
    description: 'Annual neighborhood-wide yard sale.',
    startDate: '2026-09-19',
    startTime: '09:00',
    allDay: false,
    address: 'Southport Corridor, Chicago, IL 60657',
    sourceUrl: 'https://southportneighbors.com/events/',
    status: 'approved',
  },
  {
    title: 'Clark Street Festival',
    description: 'Street festival with live music and local businesses. Runs through Sept 27.',
    startDate: '2026-09-26',
    allDay: true,
    address: 'N Clark St, Chicago, IL 60657',
    sourceUrl: 'https://lakevieweast.com/2026-chamber-annual-events/',
    status: 'approved',
  },
  {
    title: 'Southport Neighbors Quarterly Community Meeting',
    description: 'Open community meeting, at Blue Bayou.',
    startDate: '2026-10-19',
    startTime: '19:00',
    allDay: false,
    address: '3734 N Southport Ave, Chicago, IL 60613',
    latitude: '41.949965',
    longitude: '-87.664460',
    sourceUrl: 'https://southportneighbors.com/events/',
    status: 'approved',
  },
]

async function main() {
  const [source] = await db
    .select()
    .from(eventSources)
    .where(eq(eventSources.url, 'https://www.google.com/search?q=events+near+Nettelhorst+School+Chicago'))
    .limit(1)

  const sourceId =
    source?.id ??
    (
      await db
        .insert(eventSources)
        .values({
          name: 'Generic web search — near Nettelhorst School',
          url: 'https://www.google.com/search?q=events+near+Nettelhorst+School+Chicago',
          type: 'generic_search',
          notes: 'Manual WebSearch sourcing pass, hand-vetted for distance and recency.',
        })
        .returning({ id: eventSources.id })
    )[0].id

  const result = await ingestEvents(candidates, { sourceId, actor: 'claude:manual-sourcing-2026-07-29' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped (already present).`)
}

await main()
process.exit(0)
