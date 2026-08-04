import 'dotenv/config'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'

// Sourced 2026-08-04 via WebSearch/WebFetch, reviewed live with Ben before
// running — hand-researched, not scraped (see CLAUDE.md's Camps sourcing
// decision). Real providers, real venues, real currently-published pricing
// where a provider publishes it. Coordinates are hand-estimated from
// Chicago's street grid (8 blocks = 1 mile), same convention as the events
// seed scripts' hand-typed lat/long — not a live geocoding call.
//
// Pricing honesty rule (confirmed with Ben): only ONE row below —
// Lake View YMCA's Spring Break listing — is an individually published,
// dated listing (the provider's own page names that exact date and price).
// Every other provider/break combination applies that same provider's real,
// CURRENT, stated recurring pricing ("we run camp on every CPS
// non-attendance day, $X/day") to a specific future date that hasn't been
// individually re-announced yet — those all get priceIsEstimated: true, and
// the frontend renders "(estimated)" next to them (see camps/format.ts).
// A later pass should replace estimated prices with actual ones as
// providers publish them for each specific date.
//
// Scope: the 8 non-PT-conference-day breaks seeded in
// seed-2026-08-04-school-breaks.ts. Summer-week-specific candidates are a
// good follow-up for a later pass, not included here.

interface BreakInfo {
  name: string
  startDate: string
  endDate: string
}

// Matches the non-PT-conference-day breaks seeded in
// seed-2026-08-04-school-breaks.ts.
const breaks: BreakInfo[] = [
  { name: 'Labor Day', startDate: '2026-09-07', endDate: '2026-09-07' },
  { name: "Indigenous Peoples' Day", startDate: '2026-10-12', endDate: '2026-10-12' },
  { name: 'Thanksgiving Break', startDate: '2026-11-23', endDate: '2026-11-27' },
  { name: 'Winter Break', startDate: '2026-12-21', endDate: '2027-01-01' },
  { name: 'MLK Jr. Day', startDate: '2027-01-18', endDate: '2027-01-18' },
  { name: "Presidents' Day", startDate: '2027-02-15', endDate: '2027-02-15' },
  { name: 'Spring Break', startDate: '2027-03-22', endDate: '2027-03-26' },
  { name: 'Memorial Day', startDate: '2027-05-31', endDate: '2027-05-31' },
]

interface ProviderSpec {
  key: string
  name: string
  url: string
  notes: string
  address: string
  lat: number
  lng: number
  ageMin: number | null
  ageMax: number | null
  pricePerDay: string | null
  // Whether this provider/break combination's price is inferred from a
  // standing policy rather than individually published for that date —
  // defaults to true (the common case); only YMCA's Spring Break overrides
  // it to false, since that's the one page that names the exact date+price.
  priceIsEstimated?: (breakName: string) => boolean
  title: (breakName: string) => string
  description: string
  sourceUrl: string
}

const PROVIDERS: ProviderSpec[] = [
  {
    key: 'ymca',
    name: 'Lake View YMCA',
    url: 'https://www.ymcachicago.org/lake-view/',
    notes:
      '"School Days Out" program. Spring Break 2027 (Mar 22-26) individually published with real pricing: ' +
      'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/. Other dates use the same stated recurring program/price.',
    address: '3333 N Marshfield Ave, Chicago, IL 60657',
    lat: 41.9422,
    lng: -87.6692,
    ageMin: 5,
    ageMax: 13,
    pricePerDay: '70.00',
    priceIsEstimated: (breakName) => breakName !== 'Spring Break',
    title: (breakName) => `${breakName} YMCA Camp`,
    description: 'Lake View YMCA "School Days Out" — full day of activities while school is out. Ages 5-13.',
    sourceUrl: 'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/',
  },
  {
    key: 'climbzone',
    name: 'ClimbZone Chicago',
    url: 'https://www.climbzone.us/chicago/camps/',
    notes:
      'States it runs camp on "all CPS days-off-school plus Spring, Summer, Thanksgiving & Winter breaks" with published pricing.',
    address: '2500 W Bradley Pl, Chicago, IL 60618',
    lat: 41.9398,
    lng: -87.6886,
    ageMin: 5,
    ageMax: 12,
    pricePerDay: '120.00',
    title: (breakName) => `${breakName} ClimbZone Camp`,
    description: 'ClimbZone Chicago full-day camp — climbing walls, high ropes, laser tag, arts and crafts. Ages 5-12.',
    sourceUrl: 'https://www.climbzone.us/chicago/camps/',
  },
  {
    key: 'fitcitykids',
    name: 'Fit City Kids',
    url: 'https://www.fitcitykids.com/camps/',
    notes: '"School\'s Out Camp" — "When school is not in session, we ARE!" Published day-camp pricing.',
    address: '2540 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6894,
    ageMin: 4,
    ageMax: 12,
    pricePerDay: '80.00',
    title: (breakName) => `${breakName} Fit City Kids Camp`,
    description: `Fit City Kids "School's Out Camp" — fitness classes and active play, 8:30am-3pm. Ages 4-12.`,
    sourceUrl: 'https://www.fitcitykids.com/camps/',
  },
  {
    key: 'bitspace',
    name: 'BitSpace',
    url: 'https://bitspacechicago.com/camps/day-off',
    notes:
      '"Day Off Camp" — a standing program for non-attendance days, separate from their week-long summer camp. No price published as of 2026-08-04.',
    address: '2541 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6896,
    ageMin: 7,
    ageMax: 14,
    pricePerDay: null,
    title: (breakName) => `${breakName} BitSpace Day Off Camp`,
    description:
      'BitSpace "Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics. Ages 7-14 (full day) / 7-12 (half day). Price not published — contact BitSpace directly.',
    sourceUrl: 'https://bitspacechicago.com/camps/day-off',
  },
  {
    key: 'parkdistrict',
    name: 'Chicago Park District — Gill Park',
    url: 'https://www.chicagoparkdistrict.com/camp-programs',
    notes:
      'Runs a "1 Day Camp" program for non-attendance days plus named Spring/Summer break camps at Gill Park (already a known events source near Nettelhorst — see events/seed-2026-07-31-new-sources.ts). No 2026-27 non-summer pricing published as of 2026-08-04.',
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    lat: 41.9516,
    lng: -87.6473,
    ageMin: 6,
    ageMax: 12,
    pricePerDay: null,
    title: (breakName) => `${breakName} Chicago Park District Camp (Gill Park)`,
    description:
      'Chicago Park District day camp at Gill Park (825 W Sheridan Rd) — recreational activities, arts and crafts, sports. Ages 6-12. 2026-27 non-summer pricing not yet published — contact the park directly.',
    sourceUrl: 'https://www.chicagoparkdistrict.com/camp-programs',
  },
  {
    key: 'familyroom',
    name: 'Family Room Chicago',
    url: 'https://familyroomchicago.com/membership/',
    notes:
      'Not a structured day-camp curriculum — a drop-in supervised play/childcare space (Standard Daytime Hours 8:30am-6pm). Included per Ben\'s direction (feedback #50 review) despite the mismatch. Flex Day Pass 10-pack ($520, i.e. $52/pass) is a real, currently published price.',
    address: '3726 N Southport Ave, Chicago, IL 60613',
    lat: 41.949784,
    lng: -87.664458,
    ageMin: null,
    ageMax: null,
    pricePerDay: '52.00',
    title: (breakName) => `${breakName} Family Room Day Pass`,
    description:
      'Family Room Chicago — drop-in supervised play/childcare space, not a structured camp curriculum (Standard Daytime Hours 8:30am-6pm). Priced as a Flex Day Pass ($520/10-pack).',
    sourceUrl: 'https://familyroomchicago.com/membership/',
  },
]

function distanceFromNettelhorst(lat: number, lng: number): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, lat, lng).toFixed(2)
}

const candidates = breaks.flatMap((brk) =>
  PROVIDERS.map((p) => ({
    sourceKey: p.key,
    title: p.title(brk.name),
    description: p.description,
    startDate: brk.startDate,
    endDate: brk.endDate,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    pricePerDay: p.pricePerDay,
    priceIsEstimated: p.pricePerDay !== null && (p.priceIsEstimated?.(brk.name) ?? true),
    ageMin: p.ageMin,
    ageMax: p.ageMax,
    sourceUrl: p.sourceUrl,
  })),
)

async function main() {
  const insertedSources = await db
    .insert(campSources)
    .values(PROVIDERS.map((p) => ({ name: p.name, url: p.url, type: 'provider_website', isActive: true, notes: p.notes })))
    .returning({ id: campSources.id, name: campSources.name })

  const sourceIdByKey = new Map<string, string>()
  for (const p of PROVIDERS) {
    const inserted = insertedSources.find((row) => row.name === p.name)
    if (!inserted) throw new Error(`Failed to find inserted source for ${p.name}`)
    sourceIdByKey.set(p.key, inserted.id)
  }

  const insertedCamps = await db
    .insert(camps)
    .values(
      candidates.map((c) => ({
        title: c.title,
        description: c.description,
        startDate: c.startDate,
        endDate: c.endDate,
        address: c.address,
        latitude: c.lat.toFixed(6),
        longitude: c.lng.toFixed(6),
        distanceMiles: distanceFromNettelhorst(c.lat, c.lng),
        pricePerDay: c.pricePerDay,
        priceIsEstimated: c.priceIsEstimated,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        sourceUrl: c.sourceUrl,
        sourceId: sourceIdByKey.get(c.sourceKey)!,
        status: 'approved' as const,
      })),
    )
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'system:seed-2026-08-04-providers',
    action: 'camps_seeded',
    metadata: { sourceCount: insertedSources.length, campCount: insertedCamps.length },
  })

  console.log(`Seeded ${insertedSources.length} camp sources and ${insertedCamps.length} camps.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
