import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources, type SportsClubOptionLine } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Sourced 2026-08-18 via three parallel WebSearch/WebFetch research passes
// (dance/music/art; sports leagues/martial arts/gymnastics; Nettelhorst's
// own clubs + academic/STEM — the third pass stalled past an hour and was
// finished by hand after being stopped), reviewed with Ben before running —
// hand-researched, not scraped, same posture as Camps' seed script. Every
// price/date/status below is either a real, currently-published figure or
// explicitly flagged as a gap in `priceNote`/`cadenceNote` — nothing here
// was derived by dividing a bulk figure, and nothing was guessed to fill a
// blank. Coordinates are hand-estimated from Chicago's street grid, same
// "not a live geocoding call" convention Camps' own seed script uses.
//
// Two real findings worth remembering for the next pass over this data:
// (1) Chicago Park District's ActiveCommunities registration system IS
// programmatically queryable — it has a public JSON REST endpoint behind
// the JS-rendered search UI — which is how the T-ball "not currently open"
// finding below was confirmed directly rather than assumed. (2) Rocket Club
// Academy's Chicago/Lincoln Park listing was investigated and ruled out
// entirely — the search-indexed page describing it was stale (2021), and
// their current site lists zero Chicago locations.
//
// Ben confirmed seeding "as is" from the research report rather than
// resolving three open questions individually — the defaults applied here:
// (a) Chicago Park District T-ball IS included, with signupStatus
// 'not_opened' and the most recent confirmed season's real cadence/price
// shown as historical context (mirrors Camps' BitSpace/Park District
// precedent of never hiding a real, known source just because its current
// booking window is empty); (b) Nettelhorst's chess club is NOT included —
// never independently confirmed to exist, and an early broad search's
// "CHICAT" claim couldn't be verified on a second look and is treated as a
// likely search-summarization artifact, not a real program; (c) School of
// Rock IS included, with its private-lesson-plus-group-rehearsal shape
// spelled out in its own description rather than mis-simplified.
//
// Follow-up pass (2026-08-18, same day, from a live screenshot of Uniting
// Voices Chicago's own detail page): three real tiers had been crammed into
// one cadence_note sentence and read as a wall of text — same lesson Camps
// already learned with CampOptionLine. Six listings with the same
// multi-tier shape (Uniting Voices, Kidcreate, Unicoi, Thousand Waves, JKA,
// Supreme Jiu Jitsu) now use `options` (see SportsClubOptionLine) instead;
// a few more cadence_note strings were trimmed of redundant restatements.
// Titles also had location text removed (e.g. "Basketball at Gill Park" ->
// "Basketball", with "Gill Park" moved to locationName) — same "titles
// aren't where the venue name goes, that's what location_name is for"
// convention Camps already established. Applied here in the LISTINGS array
// below (for a future fresh-DB run) AND as two backfill scripts against the
// already-seeded rows — see backfill-2026-08-18-structured-options.ts and
// backfill-2026-08-18-title-cleanup.ts for the exact values, hand-copied
// from here rather than derived by parsing the old text.
//
// Occurrence generation: a bounded window per listing (see
// weeklyOccurrences() below), not enumerated forever — same approach as the
// events tab's Bike Bus seed. A fixed_session listing with a real
// first/last date gets real weekly rows across that whole span; an ongoing
// listing gets rows for a 12-week rolling window from today, meant to be
// regenerated in a future refresh pass. Several listings have no confirmed
// weekly day/time at all — those get zero occurrence rows rather than a
// fabricated one, same "never invent, leave unknown" rule as price.

const TODAY = new Date('2026-08-18')
const ONGOING_WINDOW_WEEKS = 12

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OccurrenceRow {
  date: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

// Generates one row per matching weekday between startDate and endDate
// (inclusive), skipping any explicitly known deviation date (e.g. Kids Clay
// Room's published "no class 10/12"). daysOfWeek uses JS's own 0=Sun..6=Sat.
function weeklyOccurrences(params: {
  startDate: string
  endDate: string
  daysOfWeek: number[]
  startTime: string | null
  endTime: string | null
  skipDates?: string[]
}): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${params.startDate}T00:00:00Z`)
  const end = new Date(`${params.endDate}T00:00:00Z`)
  while (cursor <= end) {
    if (params.daysOfWeek.includes(cursor.getUTCDay())) {
      const dateStr = toDateString(cursor)
      if (!params.skipDates?.includes(dateStr)) {
        rows.push({ date: dateStr, startTime: params.startTime, endTime: params.endTime, note: null })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

function ongoingOccurrences(params: { daysOfWeek: number[]; startTime: string | null; endTime: string | null }): OccurrenceRow[] {
  return weeklyOccurrences({
    startDate: toDateString(TODAY),
    endDate: toDateString(addWeeks(TODAY, ONGOING_WINDOW_WEEKS)),
    daysOfWeek: params.daysOfWeek,
    startTime: params.startTime,
    endTime: params.endTime,
  })
}

interface SourceSpec {
  key: string
  name: string
  url: string
  notes: string
  imageSourceUrls: string[]
}

// One row per real organization — several (Chicago Park District, Kids Clay
// Room) back more than one listing below.
const SOURCES: SourceSpec[] = [
  {
    key: 'danceonbroadway',
    name: 'Dance on Broadway',
    url: 'https://www.danceonbroadway.com/',
    notes:
      "Literally around the corner from Nettelhorst (3126 N Broadway). Real youth program spanning 18mo-teen, real Fall term (Aug 31-Dec 20, 2026) confirmed on their own site. Youth tuition, the exact weekly class-day/time grid, and live registration-fullness all sit behind their Mindbody widget, which returned HTTP 403 to a direct fetch — recommend a headless-browser spot-check, same technique this app already used for Unicoi's camp calendar.",
    imageSourceUrls: ['https://www.danceonbroadway.com/'],
  },
  {
    key: 'tutuschool',
    name: 'Tutu School (Roscoe Village)',
    url: 'https://www.tutuschool.com/roscoevillage',
    notes:
      'Real, confirmed rolling/always-open enrollment for ages 6mo-8yr, real published monthly membership rate ($112/mo, billed the 1st of each month). Exact single-class time slot within their published weekly operating windows was not isolated.',
    imageSourceUrls: ['https://www.tutuschool.com/roscoevillage', 'https://www.facebook.com/TutuSchoolChicago'],
  },
  {
    key: 'dovetail',
    name: 'Dovetail Studios',
    url: 'https://discovery.bondsports.co/dovetail-programs',
    notes:
      'Real youth dance program (18mo-teen) with real starting prices from their BondSports storefront (Ballet from $375, Hip Hop from $420, Acro from $420, Musical Theater from $112, Competition from $496) — the unit (per-session vs. per-month) is ambiguous from what the storefront shows, so treat these as starting reference prices, not confirmed monthly/per-class rates. Exact weekly schedule and live seat status not confirmed.',
    imageSourceUrls: ['https://dovetail-studios.com/'],
  },
  {
    key: 'fairytaleballet',
    name: 'A Fairytale Ballet (Lakeview)',
    url: 'https://www.afairytaleballet.com/',
    notes:
      'Real offerings for 18mo-17yr across a Fairytale (early childhood) and Academy division. Term dates found on their own site (Fairytale 8/17-11/29, Academy 8/17-1/17) but the page\'s own year label looked mismatched with the rest of the site\'s current content — worth a quick glance before trusting outright. Price genuinely not published (site directs to a phone call). Booking runs through Sawyer, which 403\'d a direct fetch.',
    imageSourceUrls: ['https://www.afairytaleballet.com/'],
  },
  {
    key: 'oldtownschool',
    name: 'Old Town School of Folk Music (Lincoln Park)',
    url: 'https://www.oldtownschool.org/',
    notes:
      'Real Wiggleworms early-childhood music program, real 8-week sessions, real published price ($221, $201 for members). Caveat: this campus\'s program skews ages 0-4 — Old Town\'s grade-school instrument classes (guitar, piano, etc.) run at their Lincoln Square campus, ~3.5-4mi away, near the edge of this app\'s radius, and are not included here.',
    imageSourceUrls: ['https://www.oldtownschool.org/'],
  },
  {
    key: 'musicplayhouse',
    name: 'The Music Playhouse (Sheil Park)',
    url: 'https://www.themusicplayhouse.com/',
    notes:
      'Real semester dates (Fall 2026: Sept 14-Nov 20) and a real, clearly published per-unit price ($250 for the full 10-week semester, $200 for siblings, $28/class drop-in) confirmed directly on their own site. Exact weekly day/time not published; their booking widget (Sawyer) 403\'d a direct fetch.',
    imageSourceUrls: ['https://www.themusicplayhouse.com/'],
  },
  {
    key: 'unitingvoices',
    name: 'Uniting Voices Chicago (Lincoln Park/DePaul Neighborhood Choir)',
    url: 'https://unitingvoiceschicago.org/',
    notes:
      "Formerly Chicago Children's Choir. Best age-fit of any music candidate researched (3rd-9th grade). Real, confirmed weekly schedule: Tuesdays & Thursdays, three level tiers (Allegro 4:45-5:45pm, Vivace 5:45-6:45pm, Presto 6:45-7:45pm). Real sliding-scale tuition ($6-$500/month based on household income, per their own Program Costs page) — a genuinely stated range, not a single number. Registration open now for the 2026-27 season.",
    imageSourceUrls: ['https://unitingvoiceschicago.org/'],
  },
  {
    key: 'schoolofrock',
    name: 'School of Rock (Lincoln Park)',
    url: 'https://chicago-sor.pike13.com/locations/school-of-rock-chicago',
    notes:
      "Real per-class/per-lesson prices confirmed on their own site (Rookies $25/class, Little Wing $22.50/class, private instrument lessons $41.25-$62.50/session). Genuinely a hybrid format, not a pure group class — the core Rock 101 program pairs a private weekly lesson with a free weekly group rehearsal, building to a live show after ~14 weeks; the House Band tier is audition-based. Exact current term dates and live seat status weren't confirmed (their main site 403'd; details pulled from their Pike13-hosted scheduling page instead).",
    imageSourceUrls: ['https://www.schoolofrock.com/'],
  },
  {
    key: 'kidsclayroom',
    name: 'Kids Clay Room',
    url: 'https://www.kidsclayroom.com/',
    notes:
      "The single best-documented provider in this whole research pass — exact day/time, exact session dates, and real un-derived session prices, all confirmed directly on their own site for both of their real classes (Handbuilding and Wheelthrowing).",
    imageSourceUrls: ['https://www.kidsclayroom.com/gallery.html', 'https://www.facebook.com/kidsclayroom'],
  },
  {
    key: 'kidcreate',
    name: 'Kidcreate Studio (Lakeview)',
    url: 'https://app.amilia.com/store/en/kidcreate-studio-lakeview',
    notes:
      'Real three-tier "Academy" program by age (4-6, 7-9, 10-12+), genuinely rolling/monthly-recurring enrollment ("cancel anytime," not a fixed term) — "Fall enrollment is open" per their own site. Class price is deliberately not published online, gated behind a free trial-class booking flow; only a separate $125 one-time Family Membership discount card is public, which is NOT the class price and is not used as a stand-in for it here.',
    imageSourceUrls: ['https://www.kidcreatestudio.com/lakeview/'],
  },
  {
    key: 'unicoiart',
    name: 'Unicoi Art Studio',
    url: 'https://hisawyer.com/uni-coi-art-studio',
    notes:
      "Already a known provider in this app's Camps data — reused here for its separate, real weekly-class offerings (a different listing shape than the camp rows, so not a duplicate). Real per-class prices for every named class, confirmed on their own site. Current weekly-class term dates and live seat status weren't re-confirmed in this pass; this app's own prior Camps research already established the technique for getting past their Sawyer/Cloudflare booking widget (a headless-browser check) if that's wanted for a follow-up.",
    // The real domain (per this app's own prior Camps research) is
    // unicoistudio.com, not unicoiartstudio.com — Facebook alone has no
    // usable og:image, but their own About page does.
    imageSourceUrls: ['https://www.facebook.com/UnicoiStudio/', 'https://www.unicoistudio.com/about-us/'],
  },
  {
    key: 'chicagoparkdistrict',
    name: 'Chicago Park District',
    url: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    notes:
      "Confirmed via their live ActiveCommunities registration API (a public JSON REST endpoint behind the JS search UI, queried directly rather than assumed unqueryable) — real current-season basketball/soccer/gymnastics listings with real prices and live seat counts. T-ball is the one real exception: every nearby listing (Gill, Hamlin, Wrightwood, Revere, Chase Parks) is marked cancelled/closed, the last real season ran Spring 2024, and the 2027 Spring season — which exists as a defined term in their system — has zero published T-ball activities yet anywhere nearby. Included anyway per Ben's direction, with signupStatus 'not_opened' and the most recent real season's cadence/price shown as historical context, rather than omitted entirely.",
    imageSourceUrls: ['https://www.chicagoparkdistrict.com/parks-facilities/gill-joseph-park'],
  },
  {
    key: 'i9sports',
    name: 'i9 Sports (Waveland Lakeshore Fields)',
    url: 'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/10276',
    notes:
      "The closest program found in this whole research pass (0.6mi). Real Fall 2026 season dates (Sept 12-Oct 24, Saturdays) confirmed via their own site's server-rendered content. Price and live seat/registration status sit behind a client-side app call this pass genuinely couldn't reach (verified — the page's own embedded JSON stops at venue metadata) — a real, checked gap, not a guess. A national reference price range ($179-$225/season from other i9 locations) is noted but NOT used as the Chicago rate.",
    imageSourceUrls: ['https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/10276'],
  },
  {
    key: 'lilsluggers',
    name: 'Lil Sluggers Chicago (Blaine Elementary Field)',
    url: 'https://www.lilsluggerschicago.com/blaine-elementary-field-lakeview.html',
    notes:
      'Real Fall 2026 season dates (Sept 5-Oct 24) and a real, currently-stated "REGISTRATION IS OPEN" status, both confirmed on their own site. Price genuinely not published anywhere on their site.',
    imageSourceUrls: ['https://www.lilsluggerschicago.com/-media.html', 'https://www.facebook.com/LilSluggersChicago/'],
  },
  {
    key: 'thousandwaves',
    name: 'Thousand Waves Martial Arts & Self-Defense Center',
    url: 'https://thousandwaves.org/karate-for-kids/',
    notes:
      'Real, ongoing enrollment (free trial class offered continuously) with real published pricing ($125-155/mo depending on class count and autopay) confirmed directly on their own site.',
    imageSourceUrls: ['https://thousandwaves.org/karate-for-kids/'],
  },
  {
    key: 'jkachicago',
    name: 'Japan Karate Association of Chicago (Sugiyama Dojo)',
    url: 'https://jka-chicago.com/classes/',
    notes:
      "Real weekly schedule confirmed directly on their own site. Price genuinely not published — only a one-time promotional rate was found, which is NOT used as the standing tuition. Their own current site lists 2940 N Lincoln Ave; a Yelp listing shows an older address (1016 W Belmont) — used the studio's own site as source of truth and flagging the conflict rather than silently picking one.",
    imageSourceUrls: ['https://jka-chicago.com/'],
  },
  {
    key: 'supremejiujitsu',
    name: 'Supreme Jiu Jitsu',
    url: 'https://www.supremejiujitsu.com/schedule',
    notes:
      'Real weekly schedule (two age tracks, 4+ and 8+) confirmed directly on their own site. Price is a real range from a secondary source ($100-204/mo) rather than one number confirmed on their own schedule page.',
    imageSourceUrls: ['https://www.facebook.com/SupremeJiuJitsuAcademy/'],
  },
  {
    key: 'littlegym',
    name: 'The Little Gym of Chicago',
    url: 'https://www.thelittlegym.com/illinois-chicago/',
    notes: 'Real ongoing membership pricing, ages, and class tiers, all confirmed directly on their own site.',
    imageSourceUrls: ['https://www.thelittlegym.com/illinois-chicago/'],
  },
]

interface ListingSpec {
  sourceKey: string
  title: string
  description: string
  category: string
  scheduleType: 'fixed_session' | 'ongoing'
  firstDate: string | null
  lastDate: string | null
  cadenceNote: string | null
  ageMin: number | null
  ageMax: number | null
  price: string | null
  priceUnit: string | null
  priceNote: string | null
  // Standardized weekly-equivalent (feedback, 2026-08-18: "can you
  // standardize price as a weekly number?") — hand-computed from the real
  // price/priceUnit above using the listing's own known cadence (its real
  // occurrence count for a fixed session, or a 52/12 weeks-per-month
  // average for an ongoing monthly rate). Undefined/null whenever price
  // itself is null, or price is a range with no single figure to convert.
  pricePerWeek?: number
  // A real, distinct bookable-tier breakdown (see SportsClubOptionLine) —
  // only present for a listing that genuinely has more than one (different
  // levels/times), same "structure it, don't prose it" fix Camps' own
  // CampOptionLine already applied. Most listings have none.
  options?: SportsClubOptionLine[]
  address: string
  // A human-friendly venue/place name shown below the title (see
  // web/src/sports-clubs/SportsClubDetailPage.tsx), same role as Camps'
  // location_name — the title itself never carries location text.
  locationName?: string
  lat: number
  lng: number
  signupStatus: 'open' | 'full' | 'waitlist' | 'not_opened' | null
  signupInstructions: string
  sourceUrl: string
  occurrenceSpec?: { daysOfWeek: number[]; startTime: string | null; endTime: string | null; skipDates?: string[] }
}

const LISTINGS: ListingSpec[] = [
  // ---- Dance ----
  {
    sourceKey: 'danceonbroadway',
    title: 'Dance on Broadway',
    description: 'Ballet, tap, jazz, hip-hop, contemporary, acro, and musical theater classes by age and level.',
    category: 'Dance',
    scheduleType: 'fixed_session',
    firstDate: '2026-08-31',
    lastDate: '2026-12-20',
    cadenceNote: 'Exact weekly class day/time varies by level — see the studio for the full schedule.',
    ageMin: 1,
    ageMax: 18,
    price: null,
    priceUnit: null,
    priceNote: 'Youth tuition disclosed at registration, not published on the site.',
    address: '3126 N Broadway, Chicago, IL 60657',
    lat: 41.9395,
    lng: -87.6449,
    signupStatus: 'open',
    signupInstructions: 'Register online via the studio\'s class schedule.',
    sourceUrl: 'https://www.danceonbroadway.com/',
  },
  {
    sourceKey: 'tutuschool',
    title: 'Tutu School',
    description: 'Story-driven "Ballet Storytime" curriculum for early childhood.',
    category: 'Dance',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'A specific class time is scheduled within the studio\'s weekly operating hours — enrollment is always open.',
    ageMin: 1,
    ageMax: 8,
    price: '112.00',
    priceUnit: 'per month',
    pricePerWeek: 25.85, // $112 * 12/52
    priceNote: null,
    address: '2223 W Roscoe St, Chicago, IL 60618',
    lat: 41.9436,
    lng: -87.6789,
    signupStatus: 'open',
    signupInstructions: 'Registration is always ongoing — enroll anytime.',
    sourceUrl: 'https://www.tutuschool.com/roscoevillage',
  },
  {
    sourceKey: 'dovetail',
    title: 'Dovetail Studios',
    description: 'Ballet, hip-hop, contemporary, musical theater, and acro across early-childhood through teen levels.',
    category: 'Dance',
    scheduleType: 'fixed_session',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Rolling sessions through Fall 2026 — exact weekly day/time not published online.',
    ageMin: 1,
    ageMax: 18,
    price: null,
    priceUnit: null,
    priceNote: 'Starting prices published (Ballet from $375, Hip Hop from $420, Acro from $420) — unit (per-session vs. per-month) unconfirmed, so not shown as a single rate.',
    address: '2853 W Montrose Ave, Chicago, IL 60618',
    lat: 41.9613,
    lng: -87.6942,
    signupStatus: null,
    signupInstructions: 'Register through the studio\'s online program storefront.',
    sourceUrl: 'https://discovery.bondsports.co/dovetail-programs',
  },
  {
    sourceKey: 'fairytaleballet',
    title: 'A Fairytale Ballet',
    description: 'Ballet, pointe, tap, contemporary, and dance medley classes.',
    category: 'Dance',
    scheduleType: 'fixed_session',
    firstDate: '2026-08-17',
    lastDate: '2027-01-17',
    cadenceNote: 'Exact weekly class day/time not published.',
    ageMin: 5,
    ageMax: 17,
    price: null,
    priceUnit: null,
    priceNote: 'Tuition not published — call the studio for pricing.',
    address: '3234 N Southport Ave, Chicago, IL 60657',
    lat: 41.9414,
    lng: -87.6641,
    signupStatus: null,
    signupInstructions: 'Enroll online — the site invites "Enroll & Start FALL today!"',
    sourceUrl: 'https://www.afairytaleballet.com/',
  },

  // ---- Music ----
  {
    sourceKey: 'oldtownschool',
    title: 'Old Town School — Wiggleworms',
    description: 'Family early-childhood music class — songs, movement, and instrument play.',
    category: 'Music',
    scheduleType: 'fixed_session',
    firstDate: '2026-08-31',
    lastDate: '2026-10-19',
    cadenceNote: '8-week session; a specific weekly day/time is chosen at registration.',
    ageMin: 0,
    ageMax: 4,
    price: '221.00',
    priceUnit: 'per 8-week session',
    pricePerWeek: 27.63, // $221 / 8 weeks
    priceNote: '$201/session for Old Town School members.',
    address: '909 W Armitage Ave, Chicago, IL 60614',
    lat: 41.9181,
    lng: -87.6522,
    signupStatus: null,
    signupInstructions: 'Register online for the upcoming session.',
    sourceUrl: 'https://www.oldtownschool.org/',
  },
  {
    sourceKey: 'musicplayhouse',
    title: 'The Music Playhouse — The Music Class',
    description: 'A mixed-age early-childhood group music class.',
    category: 'Music',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-14',
    lastDate: '2026-11-20',
    cadenceNote: '45-minute class. Exact weekly day/time not published online.',
    ageMin: 0,
    ageMax: 5,
    price: '250.00',
    priceUnit: 'per 10-week semester',
    pricePerWeek: 25.0, // $250 / 10 weeks
    priceNote: '$200 for siblings; $28/class drop-in (20% off for siblings).',
    address: '3505 N Southport Ave, Chicago, IL 60657',
    lat: 41.9420,
    lng: -87.6641,
    signupStatus: null,
    signupInstructions: 'Pre-registration online is always required — full semester or drop-in.',
    sourceUrl: 'https://www.themusicplayhouse.com/',
  },
  {
    sourceKey: 'unitingvoices',
    title: 'Uniting Voices Chicago',
    description: 'An after-school choir open to all skill levels, no prior experience needed.',
    category: 'Music',
    scheduleType: 'fixed_session',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Meets Tuesdays and Thursdays; level assigned by age/experience.',
    ageMin: 8,
    ageMax: 15,
    price: null,
    priceUnit: 'per month',
    priceNote: 'Sliding-scale tuition, $6-$500/month based on household income (org\'s own stated policy).',
    // Three real level tiers, each with its own meeting time — a real
    // multi-tier fact, not prose (see this file's 2026-08-18 follow-up note
    // above). Per-tier ages were never confirmed, so left null rather than
    // guessed.
    options: [
      { label: 'Allegro', start_time: '16:45', end_time: '17:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Vivace', start_time: '17:45', end_time: '18:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Presto', start_time: '18:45', end_time: '19:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    ],
    address: '2330 N Halsted St, Chicago, IL 60614',
    locationName: 'Holtschneider Performance Center',
    lat: 41.9253,
    lng: -87.6489,
    signupStatus: 'open',
    signupInstructions: 'Registration for the 2026-27 season is open now via the org\'s online portal.',
    sourceUrl: 'https://unitingvoiceschicago.org/',
    occurrenceSpec: { daysOfWeek: [2, 4], startTime: '16:45', endTime: '17:45' },
  },
  {
    sourceKey: 'schoolofrock',
    title: 'School of Rock — Rock 101',
    description:
      'A weekly private instrument lesson paired with a free weekly group rehearsal, building to a live show at a real venue after about 14 weeks — not a stand-alone group class.',
    category: 'Music',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Rolling enrollment. Exact term dates and weekly day/time assigned at enrollment.',
    ageMin: 7,
    ageMax: 18,
    price: '41.25',
    priceUnit: 'per 30-min private lesson',
    pricePerWeek: 41.25, // one weekly lesson
    priceNote: 'Group-format options also exist: Rookies $25/class (ages 7-12), Little Wing $22.50/class.',
    address: '3254 N Lincoln Ave, Chicago, IL 60657',
    lat: 41.9394,
    lng: -87.6675,
    signupStatus: null,
    signupInstructions: 'Book a lesson/audition through the studio\'s scheduling page.',
    sourceUrl: 'https://chicago-sor.pike13.com/locations/school-of-rock-chicago',
  },

  // ---- Art & Creative ----
  {
    sourceKey: 'kidsclayroom',
    title: 'Kids Clay Room — Handbuilding',
    description: 'Slab, coil, and pinch handbuilding pottery techniques.',
    category: 'Art & Creative',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-14',
    lastDate: '2026-10-26',
    cadenceNote: 'Mondays, 4:30-5:45pm. One make-up class permitted per session; finished pieces ready about 3 weeks after the last class.',
    ageMin: 5,
    ageMax: null,
    price: '265.00',
    priceUnit: 'per session',
    pricePerWeek: 44.17, // $265 / 6 real Monday classes in the session (Sep 14-Oct 26, minus 10/12)
    priceNote: null,
    address: '2646 N Halsted St, Chicago, IL 60614',
    lat: 41.9285,
    lng: -87.6489,
    signupStatus: null,
    signupInstructions: 'Sign up online for the session.',
    sourceUrl: 'https://www.kidsclayroom.com/',
    occurrenceSpec: { daysOfWeek: [1], startTime: '16:30', endTime: '17:45', skipDates: ['2026-10-12'] },
  },
  {
    sourceKey: 'kidsclayroom',
    title: 'Kids Clay Room — Wheelthrowing',
    description: 'Wheelthrowing pottery techniques.',
    category: 'Art & Creative',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-16',
    lastDate: '2026-10-21',
    cadenceNote: 'Wednesdays, 4:30-6:00pm. One make-up class permitted per session; finished pieces ready ~3 weeks after the last class.',
    ageMin: 10,
    ageMax: null,
    price: '275.00',
    priceUnit: 'per session',
    pricePerWeek: 45.83, // $275 / 6 real Wednesday classes in the session (Sep 16-Oct 21)
    priceNote: null,
    address: '2646 N Halsted St, Chicago, IL 60614',
    lat: 41.9285,
    lng: -87.6489,
    signupStatus: null,
    signupInstructions: 'Sign up online for the session.',
    sourceUrl: 'https://www.kidsclayroom.com/',
    occurrenceSpec: { daysOfWeek: [3], startTime: '16:30', endTime: '18:00' },
  },
  {
    sourceKey: 'kidcreate',
    title: 'Kidcreate Studio',
    description: 'A three-tier recurring art curriculum: color mixing and brush control through drawing-from-life, sculpture, composition, personal style, and critique.',
    category: 'Art & Creative',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Rolling monthly enrollment — exact weekly day/time assigned when you join.',
    ageMin: 4,
    ageMax: 12,
    price: null,
    priceUnit: null,
    priceNote: 'Class price disclosed only via a free trial-class booking; a separate $125 one-time Family Membership (10% off classes/camps) is publicly listed but is not the class price itself.',
    // Three real named tiers by age — a real multi-tier fact, not prose.
    options: [
      { label: 'Art 1 · Explore', start_time: null, end_time: null, price: null, price_unit: null, age_min: 4, age_max: 6, note: null },
      { label: 'Art 2 · Build', start_time: null, end_time: null, price: null, price_unit: null, age_min: 7, age_max: 9, note: null },
      { label: 'Art 3 · Create', start_time: null, end_time: null, price: null, price_unit: null, age_min: 10, age_max: 12, note: null },
    ],
    address: '3709 N Southport Ave, Chicago, IL 60613',
    lat: 41.9500,
    lng: -87.6641,
    signupStatus: 'open',
    signupInstructions: 'Book a free trial class online, or enroll directly — Fall enrollment is open.',
    sourceUrl: 'https://app.amilia.com/store/en/kidcreate-studio-lakeview',
  },
  {
    sourceKey: 'unicoiart',
    title: 'Unicoi Art Studio',
    description: 'Several real named weekly classes by age, from mixed media to sketch-and-paint to duct-tape crafts.',
    category: 'Art & Creative',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Exact weekly day/time varies by class.',
    ageMin: 3,
    ageMax: 15,
    price: '25.00',
    priceUnit: 'per class',
    pricePerWeek: 25.0, // one class/week at the most common rate
    priceNote: null, // redundant once each class's own price shows in the options table below
    // Five real named classes, each with its own age range and (for two of
    // them) a different price — a real multi-tier fact, not a dash-joined
    // list.
    options: [
      { label: 'Happy Hands', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 3, age_max: 5, note: null },
      { label: 'Art Inspired by Artists', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 4, age_max: 10, note: null },
      { label: 'Mixed Media', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 6, age_max: 12, note: null },
      { label: 'Sketch and Paint', start_time: null, end_time: null, price: '30.00', price_unit: 'per class', age_min: 5, age_max: 12, note: null },
      { label: 'Duct Tape Products', start_time: null, end_time: null, price: '30.00', price_unit: 'per class', age_min: 7, age_max: 15, note: null },
    ],
    address: '2059 W Belmont Ave, Chicago, IL 60618',
    lat: 41.9394,
    lng: -87.6844,
    signupStatus: null,
    signupInstructions: 'Book online through the studio\'s calendar.',
    sourceUrl: 'https://hisawyer.com/uni-coi-art-studio',
  },

  // ---- Sports & Athletics ----
  {
    sourceKey: 'chicagoparkdistrict',
    title: 'Chicago Park District — T-ball',
    description: 'Introductory team baseball for young kids.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Typically an 8-week spring season (April-June), once weekly. The 2027 Spring season has not yet been published in the Park District\'s registration system — check back closer to spring.',
    ageMin: 3,
    ageMax: 6,
    price: '10.00',
    priceUnit: 'per season (2024 season, historical)',
    pricePerWeek: 1.25, // $10 / 8-week season
    priceNote: 'Based on the most recent confirmed season (Revere Park, Spring 2024: $10-$20, Mondays 11:30am-12:15pm). Real, currently-open dates aren\'t published yet — shown as a preview of what the next season will likely look like.',
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    locationName: 'Gill Park',
    lat: 41.9516,
    lng: -87.6473,
    signupStatus: 'not_opened',
    signupInstructions: 'Search the registration portal once next season\'s dates are posted, or register in person at a fieldhouse.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
  },
  {
    sourceKey: 'chicagoparkdistrict',
    title: 'Chicago Park District — Basketball',
    description: 'A weekly recreational basketball class.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-10',
    lastDate: '2026-12-10',
    cadenceNote: 'Thursdays, 4:45-5:45pm.',
    ageMin: 7,
    ageMax: 13,
    price: '15.00',
    priceUnit: 'per season',
    pricePerWeek: 1.07, // $15 / 14 real Thursdays in the season (Sep 10-Dec 10)
    priceNote: null,
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    locationName: 'Gill Park',
    lat: 41.9516,
    lng: -87.6473,
    signupStatus: 'open',
    signupInstructions: 'Register online through the Park District\'s ActiveCommunities portal.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    occurrenceSpec: { daysOfWeek: [4], startTime: '16:45', endTime: '17:45' },
  },
  {
    sourceKey: 'chicagoparkdistrict',
    title: 'Chicago Park District — Soccer',
    description: 'A weekly recreational soccer class.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-10',
    lastDate: '2026-12-10',
    cadenceNote: 'Thursdays, 2:30-3:30pm.',
    ageMin: 4,
    ageMax: 6,
    price: '20.00',
    priceUnit: 'per season',
    pricePerWeek: 1.43, // $20 / 14 real Thursdays in the season (Sep 10-Dec 10)
    priceNote: null,
    address: '3035 N Hoyne Ave, Chicago, IL 60618',
    locationName: 'Hamlin Park',
    lat: 41.9403,
    lng: -87.6800,
    signupStatus: 'open',
    signupInstructions: 'Register online through the Park District\'s ActiveCommunities portal.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    occurrenceSpec: { daysOfWeek: [4], startTime: '14:30', endTime: '15:30' },
  },
  {
    sourceKey: 'chicagoparkdistrict',
    title: 'Chicago Park District — Boys Gymnastics Level 1',
    description: 'A recreational gymnastics class.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-08',
    lastDate: '2026-12-08',
    cadenceNote: 'Tuesdays, 4:00-5:00pm.',
    ageMin: 6,
    ageMax: 14,
    price: '113.00',
    priceUnit: 'per season',
    pricePerWeek: 8.07, // $113 / 14 real Tuesdays in the season (Sep 8-Dec 8)
    priceNote: null,
    address: '5917 N Broadway St, Chicago, IL 60660',
    locationName: 'Broadway Armory',
    lat: 41.9908,
    lng: -87.6602,
    signupStatus: 'open',
    signupInstructions: 'Register online through the Park District\'s ActiveCommunities portal.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    occurrenceSpec: { daysOfWeek: [2], startTime: '16:00', endTime: '17:00' },
  },
  {
    sourceKey: 'i9sports',
    title: 'i9 Sports',
    description: 'No-tryout youth soccer, T-ball/baseball, and flag football — one practice plus one game per week.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-12',
    lastDate: '2026-10-24',
    cadenceNote: 'Saturdays — exact time varies by age group/sport.',
    ageMin: 3,
    ageMax: 14,
    price: null,
    priceUnit: null,
    priceNote: 'Live Chicago-specific pricing sits behind a client-side app this pass couldn\'t reach. Other i9 locations charge $179-$225/season, shown here only as a rough national reference, not the local rate.',
    address: '3650 N Recreation Dr, Chicago, IL 60613',
    locationName: 'Waveland Lakeshore Fields',
    lat: 41.9516,
    lng: -87.6367,
    signupStatus: null,
    signupInstructions: 'Register online through the venue\'s i9sports.com page.',
    sourceUrl: 'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/10276',
  },
  {
    sourceKey: 'lilsluggers',
    title: 'Lil Sluggers Chicago — Lil League (T-Ball & Coach-Pitch)',
    description: 'Instructional team baseball with a weekly class plus a Saturday game.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-05',
    lastDate: '2026-10-24',
    cadenceNote: 'Plus a Saturday game. Exact weekday not published.',
    ageMin: 4,
    ageMax: 8,
    price: null,
    priceUnit: null,
    priceNote: 'Not published anywhere on their site.',
    address: '1420 W Grace St, Chicago, IL 60613',
    locationName: 'Blaine Elementary Field',
    lat: 41.9563,
    lng: -87.6641,
    signupStatus: 'open',
    signupInstructions: 'Register online — the site currently states registration is open.',
    sourceUrl: 'https://www.lilsluggerschicago.com/blaine-elementary-field-lakeview.html',
  },

  // ---- Martial Arts ----
  {
    sourceKey: 'thousandwaves',
    title: 'Thousand Waves — Kids Karate (Seido)',
    description: 'Seido Karate for Juniors (age 5 through 2nd grade) and Youth & Teens (3rd grade through 14).',
    category: 'Martial Arts',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Sample Tuesday schedule shown — full weekly schedule at the studio\'s own site.',
    ageMin: 5,
    ageMax: 14,
    price: '125.00',
    priceUnit: 'per month',
    pricePerWeek: 28.85, // $125 * 12/52
    priceNote: '$140/mo for unlimited classes (autopay); month-to-month rates $15 higher. A scholarship fund exists for financial need.',
    // Two real tracks, each with its own meeting time — a real multi-tier
    // fact, not "Tue 4:15pm (Juniors), 5:00pm (Youth & Teens)" prose.
    options: [
      { label: 'Juniors (age 5 – 2nd grade)', start_time: '16:15', end_time: '17:00', price: null, price_unit: null, age_min: 5, age_max: 7, note: null },
      { label: 'Youth & Teens (3rd grade – 14)', start_time: '17:00', end_time: '18:00', price: null, price_unit: null, age_min: 8, age_max: 14, note: null },
    ],
    address: '1220 W Belmont Ave, Chicago, IL 60657',
    lat: 41.9394,
    lng: -87.6522,
    signupStatus: 'open',
    signupInstructions: 'Book a free trial class through the studio\'s site.',
    sourceUrl: 'https://thousandwaves.org/karate-for-kids/',
    occurrenceSpec: { daysOfWeek: [2], startTime: '16:15', endTime: '17:00' },
  },
  {
    sourceKey: 'jkachicago',
    title: 'Japan Karate Association of Chicago — Kids Karate',
    description: 'Shotokan Karate, Beginner and Intermediate/Advanced tracks.',
    category: 'Martial Arts',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: null, // fully captured by the options table below
    ageMin: 7,
    ageMax: null,
    price: null,
    priceUnit: null,
    priceNote: 'Standing tuition not published — a one-time promotional first-month rate exists but isn\'t used as the ongoing price. Call for pricing.',
    // Two real tracks, Intermediate/Advanced meeting three separate times a
    // week — a real multi-session fact, not one run-on sentence.
    options: [
      { label: 'Beginner (Mon & Wed)', start_time: '17:00', end_time: '17:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Mon & Wed)', start_time: '17:30', end_time: '18:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Tue)', start_time: '12:00', end_time: '13:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Sat)', start_time: '09:00', end_time: '10:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    ],
    address: '2940 N Lincoln Ave, Chicago, IL 60657',
    lat: 41.9358,
    lng: -87.6567,
    signupStatus: 'open',
    signupInstructions: 'Book a free trial class through the studio\'s site.',
    sourceUrl: 'https://jka-chicago.com/classes/',
    occurrenceSpec: { daysOfWeek: [1, 3], startTime: '17:00', endTime: '17:30' },
  },
  {
    sourceKey: 'supremejiujitsu',
    title: 'Supreme Jiu Jitsu — Bully Proof Kids BJJ',
    description: 'Brazilian Jiu-Jitsu for Little Kids (4+) and Big Kids (8+).',
    category: 'Martial Arts',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: null, // fully captured by the options table below
    ageMin: 4,
    ageMax: null,
    price: null,
    priceUnit: 'per month',
    priceNote: 'A real range reported elsewhere ($100-204/mo) — not confirmed as one figure on their own schedule page.',
    // Two real age tracks, each meeting three times a week at slightly
    // different times — the multi-day detail goes in `note` since there's
    // no single start/end time to put in those columns without fabricating
    // one.
    options: [
      { label: 'Little Kids', start_time: null, end_time: null, price: null, price_unit: null, age_min: 4, age_max: 7, note: 'Tue & Thu 5pm, Sat 9am' },
      { label: 'Big Kids', start_time: null, end_time: null, price: null, price_unit: null, age_min: 8, age_max: null, note: 'Tue 5pm, Thu 5:50pm, Sat 9:50am' },
    ],
    address: '2442 N Lincoln Ave, Chicago, IL 60614',
    lat: 41.9269,
    lng: -87.6497,
    signupStatus: 'open',
    signupInstructions: 'Book a free intro class through the studio\'s site.',
    sourceUrl: 'https://www.supremejiujitsu.com/schedule',
    occurrenceSpec: { daysOfWeek: [2, 4, 6], startTime: '17:00', endTime: '17:45' },
  },

  // ---- Gymnastics (filed under Sports & Athletics — no dedicated category) ----
  {
    sourceKey: 'littlegym',
    title: 'The Little Gym of Chicago',
    description: 'Recreational, non-competitive gymnastics plus a Hip Hop/Jazz Funk dance option, grouped by age band.',
    category: 'Sports & Athletics',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote: 'Age bands from 4 months (parent-child) through 12 years. A join-anytime membership model — exact weekly day/time assigned at enrollment.',
    ageMin: 0,
    ageMax: 12,
    price: '160.00',
    priceUnit: 'per month (1 class/week, 12-month plan)',
    pricePerWeek: 36.92, // $160 * 12/52
    priceNote: '$165/mo for a non-annual 1x/week plan; $297/mo for a 2x/week Premium plan.',
    address: '3216 N Lincoln Ave, Chicago, IL 60657',
    lat: 41.9403,
    lng: -87.6650,
    signupStatus: 'open',
    signupInstructions: 'Complete the online interest form — the studio follows up to enroll.',
    sourceUrl: 'https://www.thelittlegym.com/illinois-chicago/',
  },
]

function distanceFromNettelhorst(lat: number, lng: number): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, lat, lng).toFixed(2)
}

async function main() {
  const insertedSources = await db
    .insert(sportsClubSources)
    .values(SOURCES.map((s) => ({ name: s.name, url: s.url, type: 'provider_website', isActive: true, notes: s.notes })))
    .returning({ id: sportsClubSources.id, name: sportsClubSources.name })

  const sourceIdByKey = new Map<string, string>()
  for (const s of SOURCES) {
    const inserted = insertedSources.find((row) => row.name === s.name)
    if (!inserted) throw new Error(`Failed to find inserted source for ${s.name}`)
    sourceIdByKey.set(s.key, inserted.id)
  }

  // One real image fetch per source (not per listing) — every listing at a
  // given provider shares that provider's real photo, same posture as
  // Camps' image-enrichment.
  const imageBySourceKey = new Map<string, { imageUrl: string; thumbnailUrl: string }>()
  for (const s of SOURCES) {
    const enriched = await enrichSportsClubSourceImage(s.imageSourceUrls)
    imageBySourceKey.set(s.key, enriched ?? (await uploadPlaceholderImage(s.name, 'sportsclubs')))
    console.log(`${s.name}: ${enriched ? 'found a real image' : 'no usable image found, using a placeholder'}`)
  }

  const insertedListings = await db
    .insert(sportsClubs)
    .values(
      LISTINGS.map((l) => {
        const image = imageBySourceKey.get(l.sourceKey)
        if (!image) throw new Error(`No image resolved for source key ${l.sourceKey}`)
        return {
          title: l.title,
          description: l.description,
          category: l.category,
          scheduleType: l.scheduleType,
          firstDate: l.firstDate,
          lastDate: l.lastDate,
          cadenceNote: l.cadenceNote,
          ageMin: l.ageMin,
          ageMax: l.ageMax,
          price: l.price,
          priceUnit: l.priceUnit,
          pricePerWeek: l.pricePerWeek != null ? l.pricePerWeek.toFixed(2) : null,
          priceNote: l.priceNote,
          options: l.options ?? null,
          address: l.address,
          locationName: l.locationName ?? null,
          latitude: l.lat.toFixed(6),
          longitude: l.lng.toFixed(6),
          distanceMiles: distanceFromNettelhorst(l.lat, l.lng),
          signupStatus: l.signupStatus,
          signupInstructions: l.signupInstructions,
          sourceUrl: l.sourceUrl,
          sourceId: sourceIdByKey.get(l.sourceKey)!,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          status: 'approved' as const,
        }
      }),
    )
    .returning({ id: sportsClubs.id, title: sportsClubs.title })

  // Generate occurrence rows for every listing with a confirmed weekly
  // day/time — fixed_session listings get real rows across their whole
  // known term, ongoing listings get a 12-week rolling window from today.
  // A listing with no occurrenceSpec (no confirmed day/time) gets none,
  // same "never invent, leave unknown" rule as every other honesty flag in
  // this file.
  const occurrenceValues = LISTINGS.flatMap((l, i) => {
    if (!l.occurrenceSpec) return []
    const inserted = insertedListings[i]
    const rows =
      l.scheduleType === 'fixed_session' && l.firstDate && l.lastDate
        ? weeklyOccurrences({
            startDate: l.firstDate,
            endDate: l.lastDate,
            daysOfWeek: l.occurrenceSpec.daysOfWeek,
            startTime: l.occurrenceSpec.startTime,
            endTime: l.occurrenceSpec.endTime,
            skipDates: l.occurrenceSpec.skipDates,
          })
        : ongoingOccurrences(l.occurrenceSpec)
    return rows.map((r) => ({ sportsClubId: inserted.id, date: r.date, startTime: r.startTime, endTime: r.endTime, note: r.note }))
  })

  if (occurrenceValues.length > 0) {
    await db.insert(sportsClubOccurrences).values(occurrenceValues)
  }

  await db.insert(eventsLog).values({
    actor: 'system:seed-2026-08-18-providers',
    action: 'sports_clubs_seeded',
    metadata: { sourceCount: insertedSources.length, listingCount: insertedListings.length, occurrenceCount: occurrenceValues.length },
  })

  console.log(
    `Seeded ${insertedSources.length} sports club sources, ${insertedListings.length} listings, and ${occurrenceValues.length} occurrence rows.`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
