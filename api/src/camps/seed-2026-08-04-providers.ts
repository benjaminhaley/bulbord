import 'dotenv/config'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichCampSourceImage } from './image-enrichment.js'

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
// Follow-up pass (2026-08-04, per feedback): every field is now always
// populated with the best real number research could find, even when it's
// an inferred/estimated one (never left blank when a reasonable real-world
// figure exists) — Chicago Park District's price is the district's own
// published summer-camp daily average ($8.34), not a Gill-Park-specific
// figure, and BitSpace's is their published $150 full-day maker-camp rate
// (found via a third-party listing search, not their own JS-rendered
// calendar widget, which WebFetch can't execute) — both explicitly noted as
// estimates below since neither is tied to a specific date. Family Room's
// age range reflects their own stated "no age minimum... crawling infants"
// to "high-energy 5-year-olds and up" policy (all ages welcome), not a gap.
// spots_available is left null (unknown) for every row — no provider
// publishes live availability — which the frontend always renders as
// "Spots: unknown" rather than omitting (see camps/format.ts).
//
// Also covers every non-attendance day seeded in
// seed-2026-08-04-school-breaks.ts, including the six Professional
// Development days and the two Parent-Teacher Conference days that an
// earlier pass of this script skipped. Summer-week-specific candidates are
// still a good follow-up for a later pass, not included here.

interface BreakInfo {
  name: string
  startDate: string
  endDate: string
}

// Every non-attendance day seeded in seed-2026-08-04-school-breaks.ts except
// Summer Break (handled separately — see file header).
const breaks: BreakInfo[] = [
  { name: 'Labor Day', startDate: '2026-09-07', endDate: '2026-09-07' },
  { name: 'Professional Development Day', startDate: '2026-09-25', endDate: '2026-09-25' },
  { name: "Indigenous Peoples' Day", startDate: '2026-10-12', endDate: '2026-10-12' },
  { name: 'Parent-Teacher Conference Day', startDate: '2026-11-02', endDate: '2026-11-02' },
  { name: 'Election Day', startDate: '2026-11-03', endDate: '2026-11-03' },
  { name: 'Professional Development Day', startDate: '2026-11-11', endDate: '2026-11-11' },
  { name: 'Thanksgiving Break', startDate: '2026-11-23', endDate: '2026-11-27' },
  { name: 'Winter Break', startDate: '2026-12-21', endDate: '2027-01-01' },
  { name: 'Professional Development Day', startDate: '2027-01-04', endDate: '2027-01-04' },
  { name: 'MLK Jr. Day', startDate: '2027-01-18', endDate: '2027-01-18' },
  { name: 'Professional Development Day', startDate: '2027-01-29', endDate: '2027-01-29' },
  { name: "Presidents' Day", startDate: '2027-02-15', endDate: '2027-02-15' },
  { name: 'Professional Development Day', startDate: '2027-02-23', endDate: '2027-02-23' },
  { name: 'Spring Break', startDate: '2027-03-22', endDate: '2027-03-26' },
  { name: 'Professional Development Day', startDate: '2027-04-06', endDate: '2027-04-06' },
  { name: 'Parent-Teacher Conference Day', startDate: '2027-04-12', endDate: '2027-04-12' },
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
  // A real, image-rich page to pull a representative photo/logo from — often
  // a different URL than sourceUrl (a booking/registration page rarely has
  // a usable og:image; a branch/location homepage usually does).
  imageSourceUrl: string
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
    // ymcachicago.org's own pages lazy-load images via JS with no static
    // <img>/og:image in the raw HTML (extractPageImageCandidates found
    // nothing on any of their pages) — their official Facebook page has a
    // real, static og:image instead.
    imageSourceUrl: 'https://www.facebook.com/LakeViewYMCA/',
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
    imageSourceUrl: 'https://www.climbzone.us/chicago/',
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
    imageSourceUrl: 'https://www.fitcitykids.com/',
  },
  {
    key: 'bitspace',
    name: 'BitSpace',
    url: 'https://bitspacechicago.com/day-off/',
    notes:
      '"Day Off Camp" — a standing program for non-attendance days, separate from their week-long summer camp. Full-day rate ($150/day, ages 8+) found via a third-party listing search (their own booking calendar is JS-rendered) — treated as estimated, same as every other non-individually-dated price below.',
    address: '2541 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6896,
    ageMin: 8,
    ageMax: null,
    pricePerDay: '150.00',
    title: (breakName) => `${breakName} BitSpace Day Off Camp`,
    description:
      'BitSpace "Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics, 9am-4pm. Full day for ages 8+; a half-day option also exists for ages 7-12.',
    sourceUrl: 'https://bitspacechicago.com/day-off/',
    imageSourceUrl: 'https://bitspacechicago.com/',
  },
  {
    key: 'parkdistrict',
    name: 'Chicago Park District — Gill Park',
    url: 'https://www.chicagoparkdistrict.com/camp-programs',
    notes:
      'Runs a "1 Day Camp" program for non-attendance days plus named Spring/Summer break camps at Gill Park (already a known events source near Nettelhorst — see events/seed-2026-07-31-new-sources.ts). Price is the district-wide published 2025 summer-camp daily average ($8.34/day, https://www.chicagoparkdistrict.com/about-us/news/chicago-park-district-outlines-improvements-2026-summer-day-camp-sign-process-and) — not a Gill-Park- or non-summer-specific figure, so treated as a rougher estimate than the other providers\' own quoted per-day rates.',
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    lat: 41.9516,
    lng: -87.6473,
    ageMin: 6,
    ageMax: 12,
    pricePerDay: '8.34',
    title: (breakName) => `${breakName} Chicago Park District Camp (Gill Park)`,
    description:
      'Chicago Park District day camp at Gill Park (825 W Sheridan Rd) — recreational activities, arts and crafts, sports.',
    sourceUrl: 'https://www.chicagoparkdistrict.com/camp-programs',
    imageSourceUrl: 'https://www.chicagoparkdistrict.com/parks-facilities/gill-joseph-park',
  },
  {
    key: 'familyroom',
    name: 'Family Room Chicago',
    url: 'https://familyroomchicago.com/membership/',
    notes:
      'Not a structured day-camp curriculum — a drop-in supervised play/childcare space (Standard Daytime Hours 8:30am-6pm). Included per Ben\'s direction (feedback #50 review) despite the mismatch. Flex Day Pass 10-pack ($520, i.e. $52/pass) is a real, currently published price. States no age minimum (infants through active 5+ year-olds all accommodated), so age range is left open-ended rather than "not specified."',
    address: '3726 N Southport Ave, Chicago, IL 60613',
    lat: 41.949784,
    lng: -87.664458,
    ageMin: 0,
    ageMax: null,
    pricePerDay: '52.00',
    title: (breakName) => `${breakName} Family Room Day Pass`,
    description:
      'Family Room Chicago — drop-in supervised play/childcare space, not a structured camp curriculum (Standard Daytime Hours 8:30am-6pm). Priced as a Flex Day Pass ($520/10-pack). No age minimum.',
    sourceUrl: 'https://familyroomchicago.com/membership/',
    // Same lazy-loaded-images issue as YMCA — familyroomchicago.com's own
    // pages only expose a blank placeholder SVG in raw HTML; their Facebook
    // page has a real, static photo instead.
    imageSourceUrl: 'https://www.facebook.com/familyroomchicago/',
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

  // One real image fetch per provider (not per camp) — every camp at a given
  // venue shares that venue's real photo/logo. Sequential, not parallel: a
  // handful of one-time network fetches at seed time, not a hot path.
  const imageByKey = new Map<string, { imageUrl: string; thumbnailUrl: string } | null>()
  for (const p of PROVIDERS) {
    const enriched = await enrichCampSourceImage(p.imageSourceUrl)
    imageByKey.set(p.key, enriched)
    console.log(`${p.name}: ${enriched ? 'found a real image' : 'no usable image found'}`)
  }

  const insertedCamps = await db
    .insert(camps)
    .values(
      candidates.map((c) => {
        const image = imageByKey.get(c.sourceKey) ?? null
        return {
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
          spotsAvailable: null, // unknown for every seeded row — no provider publishes live availability
          sourceUrl: c.sourceUrl,
          sourceId: sourceIdByKey.get(c.sourceKey)!,
          imageUrl: image?.imageUrl ?? null,
          thumbnailUrl: image?.thumbnailUrl ?? null,
          status: 'approved' as const,
        }
      }),
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
