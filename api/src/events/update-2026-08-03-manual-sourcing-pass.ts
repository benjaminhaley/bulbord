import 'dotenv/config'

import { ingestEvents, type CandidateEvent } from './ingest.js'

// Manual sourcing pass (Claude, no live review with Ben) against the 10 active
// event_sources rows that need ANTHROPIC_API_KEY for the automated admin
// re-sourcing button (see resourcing.ts) — that key isn't set on Railway yet,
// so this hand-checks each source directly instead and inserts what it finds
// as `pending`, same as any other sourced event (not `approved` — unlike the
// earlier 2026-07-29/08-01 seed batches, these weren't reviewed live with Ben).
// Most sources (CPL Merlo, Park District, Chicago Parent, Green City Market,
// Wendt Park, generic search, Nettelhorst Bike Bus Instagram) either had
// nothing new/confirmed enough to add, or couldn't be fetched — only Gallagher
// Way and Chicago Family Biking's Kidical Mass turned up real, dated,
// not-yet-in-the-DB occurrences.
const GALLAGHER_WAY_SOURCE_ID = '14af2af3-b60a-4154-ae9c-ebd4a8b234f9'
const CHICAGO_FAMILY_BIKING_SOURCE_ID = '6d95e59e-7be4-407e-9f23-462223027c54'

const GALLAGHER_WAY_ADDRESS = '3635 N Clark St, Chicago, IL 60613'
const NETTELHORST_ADDRESS = '3252 N Broadway, Chicago, IL 60657'

const gallagherWayCandidates: CandidateEvent[] = [
  {
    title: 'Wrigleyville Night Market',
    description: 'Free weekly night market with 50+ local vendors (vintage clothing, jewelry, home goods) and live music, 4-8pm Thursdays.',
    startDate: '2026-09-10',
    startTime: '16:00',
    allDay: false,
    address: GALLAGHER_WAY_ADDRESS,
    locationName: 'Gallagher Way',
    sourceUrl: 'https://www.gallagherway.com/events/wrigleyville-night-market/',
    status: 'pending',
  },
  {
    title: 'Movie Night: National Treasure',
    description: 'Free outdoor family movie night. Gates open 6pm, movie starts around 7:30pm — bring a blanket or rent a lawn chair.',
    startDate: '2026-09-09',
    startTime: '18:00',
    allDay: false,
    address: GALLAGHER_WAY_ADDRESS,
    locationName: 'Gallagher Way',
    sourceUrl: 'https://mommypoppins.com/chicago-kids/event/events/movies-at-gallagher-way',
    status: 'pending',
  },
  {
    title: 'Movie Night: How to Lose a Guy in 10 Days',
    description: 'Free outdoor family movie night. Gates open 6pm, movie starts around 7:30pm — bring a blanket or rent a lawn chair.',
    startDate: '2026-09-30',
    startTime: '18:00',
    allDay: false,
    address: GALLAGHER_WAY_ADDRESS,
    locationName: 'Gallagher Way',
    sourceUrl: 'https://mommypoppins.com/chicago-kids/event/events/movies-at-gallagher-way',
    status: 'pending',
  },
]

const chicagoFamilyBikingCandidates: CandidateEvent[] = [
  {
    title: 'Lakeview East Kidical Mass',
    description:
      'Family bike ride to Lincoln Park Zoo. Meet 9:00am, roll 9:15am from Nettelhorst\'s front playlot. Led by Christina Hayford & Peter Compernolle. Rain or shine.',
    startDate: '2026-09-26',
    startTime: '09:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School',
    sourceUrl: 'http://www.chicagofamilybiking.org/events',
    status: 'pending',
  },
  {
    title: 'Lakeview East Kidical Mass',
    description:
      'Halloween-themed family bike ride. Meet 9:00am, roll 9:15am from Nettelhorst\'s front playlot. Led by Christina Hayford & Peter Compernolle. Rain or shine.',
    startDate: '2026-10-31',
    startTime: '09:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School',
    sourceUrl: 'http://www.chicagofamilybiking.org/events',
    status: 'pending',
  },
]

async function main() {
  const gallagherResult = await ingestEvents(gallagherWayCandidates, {
    sourceId: GALLAGHER_WAY_SOURCE_ID,
    actor: 'claude:manual-sourcing',
  })
  console.log('Gallagher Way:', gallagherResult)

  const bikingResult = await ingestEvents(chicagoFamilyBikingCandidates, {
    sourceId: CHICAGO_FAMILY_BIKING_SOURCE_ID,
    actor: 'claude:manual-sourcing',
  })
  console.log('Chicago Family Biking:', bikingResult)
}

await main()
process.exit(0)
