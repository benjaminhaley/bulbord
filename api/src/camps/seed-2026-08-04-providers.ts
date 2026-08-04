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
// Second follow-up pass (2026-08-04, per feedback): a stricter rule on WHAT
// counts as a real per-day price — never a rate derived by dividing a
// weekly/bulk figure (e.g. a 10-pack price ÷ 10, or a whole-season spending
// average ÷ days), only an actually-published single-day/single-session
// rate. Under this rule: Family Room's price changed from $52 (its Flex Day
// Pass 10-pack ÷ 10) to $35 (their actual, if since-unlisted, single "1 Day
// Pass" product) — still marked estimated since it's not tied to a specific
// date, and it also switched from the Southport location to the Broadway
// location Ben asked for (3229 N Broadway — a few doors from Nettelhorst
// itself). Chicago Park District's price was removed entirely (was $8.34,
// the district's whole-season summer spending average — not a real
// single-day rate for anything, let alone Gill Park's own non-summer "1 Day
// Camp" program specifically) — `pricePerDay: null` is more honest than a
// derived number here, matching the "never fabricate, leave unknown"
// posture the rest of this codebase already follows for missing data.
// Every provider also now has real bookingInstructions (when/how to
// register) and prepInstructions (what to bring/prepare beforehand) —
// researched per provider, not derived or invented.
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
  bookingInstructions: string
  prepInstructions: string
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
    bookingInstructions:
      'Register online at ymcachicago.org/lake-view (look for "School Days Out"), call the Lake View Y at 773-248-3333, or sign up in person at the front desk.',
    prepInstructions:
      'Pack a lunch and a water bottle (no glass). Bring a swimsuit and towel if the day includes pool time, and dress for active play.',
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
    bookingInstructions:
      'Sign up online at climbzone.us/chicago/camps for whichever specific day(s) you need — no minimum number of days required.',
    prepInstructions:
      'Wear sneakers or gym shoes. Grip socks are required in the soft-play area (bring your own or buy a pair on-site). Pack a lunch, or pre-order one from ClimbZone for $10/child.',
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
    bookingInstructions:
      'Register online at fitcitykids.com/camps. If a date you need isn\'t listed, email Camps@FitCityKids.com — they\'ll try to accommodate it.',
    prepInstructions: 'Bring gym shoes, socks, a labeled water bottle, a snack, and a lunch.',
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
    bookingInstructions:
      'Register online at education.bitspacechicago.com/day-off-camps. Each session needs a minimum of 8 campers to run, so register early.',
    prepInstructions:
      'Pack a nut-free sack lunch, snacks, and a water bottle. No open-toed shoes, crocs, loose jewelry, or loose clothing — bring a hair tie for long hair, and dress for mess (some days get messy). A phone is fine for emergencies but must stay zipped in the backpack.',
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
      'Runs a "1 Day Camp" program for non-attendance days plus named Spring/Summer break camps at Gill Park (already a known events source near Nettelhorst — see events/seed-2026-07-31-new-sources.ts). No genuine single-day price found — the district only publishes a whole-season summer spending average ($8.34/day across the 6-week program), which is a derived aggregate, not a real per-day rate for anything specific, so price is left unpublished rather than showing that average as if it were one.',
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    lat: 41.9516,
    lng: -87.6473,
    ageMin: 6,
    ageMax: 12,
    pricePerDay: null,
    bookingInstructions:
      'Create a free account at chicagoparkdistrict.com (Programs > Registration Information) and register online, or register in person at the Gill Park fieldhouse (825 W Sheridan Rd) — call ahead to confirm in-person registration hours.',
    prepInstructions:
      'Bring a backpack, a change of clothes if needed, a water bottle, and sunscreen (apply before arrival). A free lunch and snack are provided district-wide, though kids are welcome to bring their own.',
    title: (breakName) => `${breakName} Chicago Park District Camp (Gill Park)`,
    description:
      'Chicago Park District day camp at Gill Park (825 W Sheridan Rd) — recreational activities, arts and crafts, sports.',
    sourceUrl: 'https://www.chicagoparkdistrict.com/camp-programs',
    imageSourceUrl: 'https://www.chicagoparkdistrict.com/parks-facilities/gill-joseph-park',
  },
  {
    key: 'familyroom',
    name: 'Family Room Chicago (Broadway)',
    url: 'https://familyroomchicago.com/membership/',
    notes:
      'Not a structured day-camp curriculum — a drop-in supervised play/childcare space (Standard Daytime Hours 9am-6pm). Included per Ben\'s direction (feedback #50 review) despite the mismatch. This is their Broadway Clubhouse Suite location specifically (Ben asked for Broadway over the Southport Play Studio — familyroomchicago.com/membership/ lists three locations total). Price is their single "1 Day Pass" product ($35) — not the Flex Day Pass 10-pack ($520/10 = $52) an earlier pass of this script mistakenly divided down; per Ben\'s explicit instruction, only a genuinely published single-unit rate should be shown, never a bulk/weekly rate divided out. That $35 listing (familyroomchicago.com/product/drop-in-family-room-after-school-care-sy25-26/) is no longer live as of 2026-08-04 (likely a lapsed SY25-26 seasonal listing), so it\'s still treated as an estimate. States no age minimum (infants through active 5+ year-olds all accommodated), so age range is left open-ended rather than "not specified."',
    address: '3229 N Broadway, Chicago, IL 60657',
    lat: 41.94125,
    lng: -87.6447,
    ageMin: 0,
    ageMax: null,
    pricePerDay: '35.00',
    bookingInstructions:
      'No reservation needed for general drop-in play — just walk in during open hours (9am-6pm daily). Download the Family Room app to book a Day Pass in advance or manage a membership.',
    prepInstructions: 'None required — it\'s a drop-in play space, come as you are.',
    title: (breakName) => `${breakName} Family Room Day Pass (Broadway)`,
    description:
      'Family Room Chicago — Broadway Clubhouse Suite. A drop-in supervised play/childcare space, not a structured camp curriculum (open 9am-6pm daily). No age minimum.',
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
    bookingInstructions: p.bookingInstructions,
    prepInstructions: p.prepInstructions,
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
          bookingInstructions: c.bookingInstructions,
          prepInstructions: c.prepInstructions,
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
