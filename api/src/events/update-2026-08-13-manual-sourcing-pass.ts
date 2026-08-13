import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Manual sourcing pass (Claude, no live review with Ben) — ANTHROPIC_API_KEY
// still isn't set on Railway, so the admin "Re-run event sourcing" button
// would silently find nothing (see resourcing.ts). Same posture as
// update-2026-08-03-manual-sourcing-pass.ts: every active source hand-checked
// directly, real/dated/upcoming candidates inserted as `pending` (never
// auto-approved — these weren't reviewed live with Ben). Unlike that earlier
// pass, this one also updates event_sources.last_checked_at for every source
// actually checked (the earlier pass only called ingestEvents, never touched
// event_sources, so the admin dev tool's "Sources last checked" line stayed
// stale even after a real manual pass — an oversight, fixed here).
const ALL_ACTIVE_SOURCE_IDS = [
  '6fc381e2-db59-44df-9fc3-6c2e10edd36e', // Chicago DOT Block Party Permits
  '14af2af3-b60a-4154-ae9c-ebd4a8b234f9', // Gallagher Way
  'f6198d6e-4390-4ad4-85b0-91bb318c637a', // CPL Merlo
  '19b8d7be-0ceb-4b76-b82c-ba4554885ff9', // Generic web search
  '2eeb7819-a74d-4ebc-96a9-d468021d4081', // Nettelhorst Bike Bus
  'fc76232a-2b70-45a4-8a72-a651cb4a4940', // Green City Market
  '6d95e59e-7be4-407e-9f23-462223027c54', // Chicago Family Biking
  'b9d00d30-a921-4c39-a125-05fc40121c9a', // Music Box
  'ad5ab9b9-8532-415d-860f-f7d35cd2329b', // Peggy Notebaert
  '2accbccd-3689-477b-bb86-d8d01e7f4c4c', // Chicago Park District
  'b29b5c9a-8584-4a96-8af2-eb972488a187', // Chicago Parent Magazine
  'd0ea21d5-4814-4028-ab6d-0b34743a33c7', // Nettelhorst PTO Newsletter
  'e4fda3a9-1a0a-4cc0-a170-69107dc57a04', // Chicago Growth Project
]

const MERLO_SOURCE_ID = 'f6198d6e-4390-4ad4-85b0-91bb318c637a'
const MERLO_ADDRESS = '644 W Belmont Ave, Chicago, IL 60657'

const GENERIC_SEARCH_SOURCE_ID = '19b8d7be-0ceb-4b76-b82c-ba4554885ff9'

const GREEN_CITY_MARKET_SOURCE_ID = 'fc76232a-2b70-45a4-8a72-a651cb4a4940'
const GREEN_CITY_MARKET_ADDRESS = '1817 N Clark St, Chicago, IL 60614'

const PEGGY_NOTEBAERT_SOURCE_ID = 'ad5ab9b9-8532-415d-860f-f7d35cd2329b'
const PEGGY_NOTEBAERT_ADDRESS = '2430 N Cannon Dr, Chicago, IL 60614'

const PARK_DISTRICT_SOURCE_ID = '2accbccd-3689-477b-bb86-d8d01e7f4c4c'

const CHICAGO_PARENT_SOURCE_ID = 'b29b5c9a-8584-4a96-8af2-eb972488a187'

const merloCandidates: CandidateEvent[] = [
  {
    title: 'Back to School Clothing Swap',
    description: 'Bring your lightly worn clothes and take home new outfits — nothing to bring? Come anyway.',
    startDate: '2026-08-22',
    startTime: '14:00',
    allDay: false,
    address: MERLO_ADDRESS,
    locationName: 'Chicago Public Library — Merlo Branch',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/6a5f8dee7b79214226aa1756',
    status: 'pending',
  },
  {
    title: 'Film Screening: Cinderella (1950)',
    description: "Disney's classic animated feature, screened for preschoolers, kids, and all ages.",
    startDate: '2026-08-23',
    startTime: '14:00',
    allDay: false,
    address: MERLO_ADDRESS,
    locationName: 'Chicago Public Library — Merlo Branch',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/6a4fcb671006a63d00213a15',
    status: 'pending',
  },
  {
    title: 'Craft Supply Swap',
    description: 'Swap your unused craft supplies for what you really need.',
    startDate: '2026-09-28',
    startTime: '17:00',
    allDay: false,
    address: MERLO_ADDRESS,
    locationName: 'Chicago Public Library — Merlo Branch',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/6a71fd419006f7535314d059',
    status: 'pending',
  },
  {
    title: 'Halloween Window Painting',
    description: "Help decorate for Halloween by painting the library's front windows.",
    startDate: '2026-10-14',
    startTime: '15:30',
    allDay: false,
    address: MERLO_ADDRESS,
    locationName: 'Chicago Public Library — Merlo Branch',
    sourceUrl: 'https://chipublib.bibliocommons.com/events/6a71fc9a9006f7535314d041',
    status: 'pending',
  },
]

const genericSearchCandidates: CandidateEvent[] = [
  {
    title: 'Oktoberfest Chicago',
    description:
      "25th annual Bavarian beer garden at St. Alphonsus with live oompah bands, brats, and a kinderfest for families. Runs Fri-Sun, Sep 25-27 (Fri 5-10pm, Sat noon-10pm, Sun noon-7pm) — this listing covers the opening day.",
    startDate: '2026-09-25',
    startTime: '17:00',
    allDay: false,
    address: '1429 W Wellington Ave, Chicago, IL 60657',
    locationName: 'St. Alphonsus',
    sourceUrl: 'https://www.eventeny.com/events/oktoberfest-chicago-2026-31843/',
    status: 'pending',
  },
]

const greenCityMarketCandidates: CandidateEvent[] = (
  ['2026-08-15', '2026-08-19', '2026-08-22', '2026-08-26', '2026-08-29'] as const
).map((startDate) => ({
  title: 'Green City Market',
  description: "Chicago's sustainable farmers market — produce, prepared food, and family activities.",
  startDate,
  startTime: '07:00',
  allDay: false,
  address: GREEN_CITY_MARKET_ADDRESS,
  locationName: 'Green City Market — Lincoln Park',
  sourceUrl: 'https://www.greencitymarket.org/market/details/lincoln',
  status: 'pending',
}))

const peggyNotebaertCandidates: CandidateEvent[] = [
  {
    title: 'Sensory Friendly Morning',
    description: 'A sensory-friendly morning for guests with disabilities and veterans.',
    startDate: '2026-08-19',
    startTime: '09:00',
    allDay: false,
    address: PEGGY_NOTEBAERT_ADDRESS,
    locationName: 'Peggy Notebaert Nature Museum',
    sourceUrl: 'https://naturemuseum.org/events',
    status: 'pending',
  },
  {
    title: 'Casting on the Pier',
    description: 'Family fishing program on the museum pier.',
    startDate: '2026-08-19',
    startTime: '11:00',
    allDay: false,
    address: PEGGY_NOTEBAERT_ADDRESS,
    locationName: 'Peggy Notebaert Nature Museum',
    sourceUrl: 'https://naturemuseum.org/events',
    status: 'pending',
  },
]

const parkDistrictCandidates: CandidateEvent[] = [
  {
    title: 'Movies in the Parks: The Wizard of Oz',
    description: 'Free outdoor family movie screening.',
    startDate: '2026-08-22',
    startTime: '20:30',
    allDay: false,
    address: '2021 N Burling St, Chicago, IL 60614',
    locationName: 'Oz Park',
    sourceUrl: 'https://www.chicagoparkdistrict.com/movies-parks',
    status: 'pending',
  },
  {
    title: 'Movies in the Parks: Star Wars: A New Hope',
    description: 'Free outdoor family movie screening.',
    startDate: '2026-08-31',
    startTime: '20:30',
    allDay: false,
    address: '2045 N Lincoln Park West, Chicago, IL 60614',
    locationName: 'Lincoln Park Cultural Center',
    sourceUrl: 'https://www.chicagoparkdistrict.com/movies-parks',
    status: 'pending',
  },
]

const chicagoParentCandidates: CandidateEvent[] = [
  {
    title: 'Fall Fest at Lincoln Park Zoo',
    description:
      'Free fall festival with pumpkin picking, a fire pit for s\'mores, rides, and entertainment. Runs weekends 8am-5pm, Sep 25 through Nov 1 — this listing covers the opening day.',
    startDate: '2026-09-25',
    startTime: '08:00',
    allDay: false,
    address: '2001 N Clark St, Chicago, IL 60614',
    locationName: 'Lincoln Park Zoo',
    sourceUrl: 'https://www.lpzoo.org/event/fall-fest/',
    status: 'pending',
  },
]

async function main() {
  const actor = 'claude:manual-sourcing'

  console.log('Merlo:', await ingestEvents(merloCandidates, { sourceId: MERLO_SOURCE_ID, actor }))
  console.log('Generic search:', await ingestEvents(genericSearchCandidates, { sourceId: GENERIC_SEARCH_SOURCE_ID, actor }))
  console.log(
    'Green City Market:',
    await ingestEvents(greenCityMarketCandidates, { sourceId: GREEN_CITY_MARKET_SOURCE_ID, actor }),
  )
  console.log(
    'Peggy Notebaert:',
    await ingestEvents(peggyNotebaertCandidates, { sourceId: PEGGY_NOTEBAERT_SOURCE_ID, actor }),
  )
  console.log('Park District:', await ingestEvents(parkDistrictCandidates, { sourceId: PARK_DISTRICT_SOURCE_ID, actor }))
  console.log(
    'Chicago Parent:',
    await ingestEvents(chicagoParentCandidates, { sourceId: CHICAGO_PARENT_SOURCE_ID, actor }),
  )

  // Every active source above was hand-checked this pass (including the ones
  // that turned up nothing new — CDOT permits, Gallagher Way, Nettelhorst
  // Bike Bus, Chicago Family Biking, Music Box, Chicago Growth Project — and
  // the two sources with no fetchable page at all, PTO Newsletter and
  // Nettelhorst Bike Bus's Instagram), so last_checked_at reflects that a
  // real check happened, not just that something new was found.
  for (const sourceId of ALL_ACTIVE_SOURCE_IDS) {
    await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, sourceId))
  }
  console.log(`Updated last_checked_at for ${ALL_ACTIVE_SOURCE_IDS.length} sources.`)
}

await main()
process.exit(0)
