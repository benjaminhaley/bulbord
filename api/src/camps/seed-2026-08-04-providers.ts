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
//
// Third follow-up pass (2026-08-04, per feedback): Family Room's price was
// under-researched — Ben pointed directly at their real "Day Camp:
// Single-Day Drop-In Pass" product page, corrected to the real $95 full-day
// rate (see ProviderSpec.familyroom below). Separately, Ben checked Chicago
// Park District's real live registration search (ActiveCommunities) for
// Labor Day and found zero results — unlike the other four recurring-policy
// providers, Park District never states a blanket "every non-attendance
// day" promise, so speculatively generating 17 unverified camp candidates
// for it was itself the mistake, not just the missing price.
// `ProviderSpec.hasRecurringOffering: false` (Park District only) now
// excludes a provider from candidate generation entirely rather than
// guessing; it still gets a real camp_sources row with zero camps, ready to
// be populated once specific dates are confirmed via that search tool.
// Also: every source's URL now points to the actual page you'd go to book
// from (not a generic marketing page) — BitSpace moved to its real
// registration portal (education.bitspacechicago.com) and Park District to
// the ActiveCommunities search itself.
//
// Fourth follow-up pass (2026-08-04, per feedback): Ben's own direct checks
// of two more providers' real pages found the same "assumed every date is
// open, but the real page says otherwise" problem — YMCA's School Days Out
// page confirmed no Labor Day/Sep 25 offering (Oct 12 is the earliest
// open date: see earliestConfirmedDate below), and Fit City Kids' real
// dedicated page (fitcitykids.com/schools-out-camp/ — an earlier pass used
// the generic /camps/ page instead) confirmed no Labor Day offering either,
// with a corrected $120/day full-day (8am-6pm) rate. Applying the same
// scrutiny proactively (not waiting for Ben to catch it) to the two
// remaining recurring-policy providers found ClimbZone's page has no
// evidence either way (their specific dates live behind an iClassPro
// registration portal this codebase can't query, same as Fit City Kids'
// parent portal), but BitSpace's own page explicitly says "Keep an eye out
// for camp options for 2026-27 School Year!" — a stronger finding than a
// partial-year gap, since it means NOTHING is confirmed open yet for any
// seeded date. BitSpace was moved to hasRecurringOffering: false,
// same treatment as Chicago Park District, rather than a partial-year cutoff.

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
  description: string
  sourceUrl: string
  // A real, image-rich page to pull a representative photo/logo from — often
  // a different URL than sourceUrl (a booking/registration page rarely has
  // a usable og:image; a branch/location homepage usually does).
  imageSourceUrl: string
  // Whether this provider has a genuine, stated "we run this program on
  // every CPS non-attendance day" policy — true for the four providers whose
  // own sites say exactly that (YMCA, ClimbZone, Fit City Kids, BitSpace),
  // which is what justifies generating a speculative candidate for every
  // break date below. Chicago Park District has no such standing claim —
  // their offerings are per-specific-posted-session in a live registration
  // system (ActiveCommunities), not a blanket promise — so it defaults to
  // false and is inserted as a known camp_sources row with zero speculative
  // camps rather than 17 unverified ones. See its own notes for detail.
  hasRecurringOffering?: boolean
  // Even a provider with a genuine recurring-offering policy can have a real
  // registration system that simply hasn't opened bookings for the earliest
  // break dates yet (found 2026-08-04: Lake View YMCA's own School Days Out
  // page confirmed Labor Day and the Sept 25 PD day are not open for
  // registration, with Oct 12 the earliest currently-open date) — no
  // candidate is generated for any break starting before this date when set.
  earliestConfirmedDate?: string
}

const PROVIDERS: ProviderSpec[] = [
  {
    key: 'ymca',
    name: 'Lake View YMCA',
    url: 'https://www.ymcachicago.org/lake-view/',
    notes:
      '"School Days Out" program. Spring Break 2027 (Mar 22-26) individually published with real pricing: ' +
      'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/. Other dates use the same stated recurring program/price. Ben checked that page directly (2026-08-04) and confirmed registration is not yet open for Labor Day or the Sep 25 PD day — Oct 12 (Indigenous Peoples\' Day) is the earliest date currently open, so no candidates are generated for the two dates before it (see earliestConfirmedDate below). This mirrors the Chicago Park District fix: a provider stating a general "every non-attendance day" policy doesn\'t guarantee its real registration system has actually opened bookings that far out yet.',
    address: '3333 N Marshfield Ave, Chicago, IL 60657',
    lat: 41.9422,
    lng: -87.6692,
    ageMin: 5,
    ageMax: 13,
    pricePerDay: '70.00',
    priceIsEstimated: (breakName) => breakName !== 'Spring Break',
    earliestConfirmedDate: '2026-10-12',
    bookingInstructions:
      'Register online at ymcachicago.org/lake-view (look for "School Days Out"), call the Lake View Y at 773-248-3333, or sign up in person at the front desk.',
    prepInstructions:
      'Pack a lunch and a water bottle (no glass). Bring a swimsuit and towel if the day includes pool time, and dress for active play.',
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
    description: 'ClimbZone Chicago full-day camp — climbing walls, high ropes, laser tag, arts and crafts. Ages 5-12.',
    sourceUrl: 'https://www.climbzone.us/chicago/camps/',
    imageSourceUrl: 'https://www.climbzone.us/chicago/',
  },
  {
    key: 'fitcitykids',
    name: 'Fit City Kids',
    url: 'https://www.fitcitykids.com/schools-out-camp/',
    notes:
      `"School's Out Camp" — real dedicated page, not the generic /camps/ page an earlier pass used (confirmed 2026-08-04). Full day (8am-6pm) is $85 for the 8am-3pm day camp block plus $35 for the 3pm-6pm after-camp extension, i.e. $120 total for the full 8am-6pm day — Ben's own stated comparison figure. The page says "26-27 School Year Dates Now LIVE!" but individual session dates are only listed on their parent portal (not fetchable as static HTML); Ben checked directly and confirmed there's no Labor Day offering — the schedule starts exactly Sep 25, 2026 (see earliestConfirmedDate below).`,
    address: '2540 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6894,
    ageMin: 4,
    ageMax: 12,
    pricePerDay: '120.00',
    earliestConfirmedDate: '2026-09-25',
    bookingInstructions:
      'Register through the parent portal at fitcitykids.com/schools-out-camp/. If a date you need isn\'t listed, email Camps@FitCityKids.com — they\'ll try to accommodate it.',
    prepInstructions: 'Bring gym shoes, socks, a labeled water bottle, a snack, and a lunch.',
    description: `Fit City Kids "School's Out Camp" — fitness classes and active play, 8am-6pm (day camp plus after-camp extension). Ages 4-12.`,
    sourceUrl: 'https://www.fitcitykids.com/schools-out-camp/',
    imageSourceUrl: 'https://www.fitcitykids.com/',
  },
  {
    key: 'bitspace',
    name: 'BitSpace',
    url: 'https://education.bitspacechicago.com/day-off-camps',
    notes:
      `"Day Off Camp" — a standing program for non-attendance days, separate from their week-long summer camp, with a real full-day rate ($150/day, ages 8+) corroborated across three independent searches as of 2026-08-04. But their own bitspacechicago.com/day-off/ page explicitly states "Keep an eye out for camp options for 2026-27 School Year!" — meaning NOTHING is confirmed open yet for any of the seeded 2026-27 break dates (a stronger version of the YMCA/Fit City Kids "not open yet for early dates" finding — here it's the whole year, not just the earliest dates). Following the same principle as Chicago Park District: no speculative candidates are generated (hasRecurringOffering: false) until BitSpace actually opens registration and specific dates can be confirmed. Source URL is the actual registration portal (education.bitspacechicago.com/day-off-camps), not the marketing page — per Ben's direction, the source should be where you'd actually go to book.`,
    address: '2541 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6896,
    ageMin: 8,
    ageMax: null,
    pricePerDay: '150.00',
    hasRecurringOffering: false,
    bookingInstructions:
      'Register online at education.bitspacechicago.com/day-off-camps. Each session needs a minimum of 8 campers to run, so register early.',
    prepInstructions:
      'Pack a nut-free sack lunch, snacks, and a water bottle. No open-toed shoes, crocs, loose jewelry, or loose clothing — bring a hair tie for long hair, and dress for mess (some days get messy). A phone is fine for emergencies but must stay zipped in the backpack.',
    description:
      'BitSpace "Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics, 9am-4pm. Full day for ages 8+; a half-day option also exists for ages 7-12.',
    sourceUrl: 'https://education.bitspacechicago.com/day-off-camps',
    imageSourceUrl: 'https://bitspacechicago.com/',
  },
  {
    key: 'parkdistrict',
    name: 'Chicago Park District — Gill Park',
    // The actual registration search tool, per Ben's direction that the
    // source should be where you'd go to book — not the marketing page.
    url: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    notes:
      `A known "1 Day Camp" program exists district-wide and is already a known events source near Nettelhorst (see events/seed-2026-07-31-new-sources.ts), but — unlike YMCA/ClimbZone/Fit City Kids/BitSpace — Chicago Park District never states a blanket "we run this on every non-attendance day" policy; real availability lives in their live ActiveCommunities registration search (anc.apm.activecommunities.com/chicagoparkdistrict/activity/search), which Ben checked directly for Labor Day 2026-09-07 and found zero results. That tool is a JS-rendered SPA this codebase's tooling can't query programmatically, so rather than guess at which (if any) of the seeded break dates might eventually have a real posted session, no speculative camps are generated for this source at all (see hasRecurringOffering below) — it exists here as a known, real source with zero current listings, ready to be populated by a future update script once specific dates are confirmed via that search tool. Also: no genuine single-day price was ever found for this program either — the only figures published anywhere were a whole-season summer spending average and unrelated 2018-era full-program fees for other parks, neither a real per-day rate for anything here.`,
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    lat: 41.9516,
    lng: -87.6473,
    ageMin: 6,
    ageMax: 12,
    pricePerDay: null,
    bookingInstructions:
      'Search anc.apm.activecommunities.com/chicagoparkdistrict/activity/search for a specific posted session (create a free account first), or register in person at the Gill Park fieldhouse (825 W Sheridan Rd) — call ahead to confirm in-person registration hours.',
    prepInstructions:
      'Bring a backpack, a change of clothes if needed, a water bottle, and sunscreen (apply before arrival). A free lunch and snack are provided district-wide, though kids are welcome to bring their own.',
    description:
      'Chicago Park District day camp at Gill Park (825 W Sheridan Rd) — recreational activities, arts and crafts, sports.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    imageSourceUrl: 'https://www.chicagoparkdistrict.com/parks-facilities/gill-joseph-park',
    hasRecurringOffering: false,
  },
  {
    key: 'familyroom',
    name: 'Family Room Chicago (Broadway)',
    url: 'https://familyroomchicago.com/shop/camp/day-camp/one-day-camp/family-room-day-camp-single-day-drop-in-pass-lakeview-east/',
    notes:
      'Not a fully structured multi-week curriculum like the other five, but genuinely has its own real "Day Camp: Single-Day Drop-In Pass" product line (confirmed 2026-08-04 — an earlier pass of this script under-researched this and used a generic membership page instead) — included per Ben\'s direction (feedback #50 review). This is their Broadway Clubhouse Suite location specifically (Ben asked for Broadway over the Southport Play Studio; familyroomchicago.com lists three locations total). Price is the real, currently published 9-hour Full-Day Pass rate ($95 non-member) from that product page — tiered pricing also exists for a 3-hour Express Pass ($45) and 5-hour Half-Day Pass ($65), plus member discounts, but the 9-hour rate is what\'s comparable to the other five providers\' full-day rates. Still marked estimated since it\'s a standing rate, not tied to one specific date. The product page has a real date-picker calendar, but as of 2026-08-04 it isn\'t populated with inventory for dates this far out — spots_available is left null/"unknown" for exactly that reason, not because we didn\'t check.',
    address: '3229 N Broadway, Chicago, IL 60657',
    lat: 41.94125,
    lng: -87.6447,
    ageMin: 0,
    ageMax: null,
    pricePerDay: '95.00',
    bookingInstructions:
      'Book online at familyroomchicago.com (search "Day Camp: Single-Day Drop-In Pass") and pick a specific date — 3-hour, 5-hour, and full 9-hour options are available. Drop-off is flexible between 7:00am-4:30pm, with pick-up between 11:00am-6:00pm.',
    prepInstructions: "Nothing to pack — healthy snacks and a whole-food lunch are included for the day.",
    description:
      'Family Room Chicago — Broadway Clubhouse Suite. "Day Camp: Single-Day Drop-In Pass" — up to 9 hours of supervised sports, free play, and creative activities with a 10:1 camper-to-staff ratio.',
    sourceUrl: 'https://familyroomchicago.com/shop/camp/day-camp/one-day-camp/family-room-day-camp-single-day-drop-in-pass-lakeview-east/',
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
  PROVIDERS.filter((p) => p.hasRecurringOffering ?? true)
    .filter((p) => !p.earliestConfirmedDate || brk.startDate >= p.earliestConfirmedDate)
    .map((p) => ({
      sourceKey: p.key,
      // Just the provider name — feedback (2026-08-04): a title like "Labor
      // Day YMCA Camp" repeats info already shown as the accordion section
      // header (the break) and the date field below it, and "Camp" is
      // redundant on the Camps tab itself. The provider name is the only
      // genuinely differentiating information at this level.
      title: p.name,
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
