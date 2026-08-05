import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog } from '../db/schema.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichCampSourceImage } from './image-enrichment.js'

// One-off addition of a 7th camp provider — Unicoi Art Studio — found via
// Ben directly pointing at their real, live Sawyer booking calendar
// (hisawyer.com/uni-coi-art-studio/schedules/widget_calendar) and confirming
// a real listed camp on Sep 25, 2026. Unlike seed-2026-08-04-providers.ts's
// initial six (each hand-reviewed with Ben before running), this one is
// scoped to just the new provider — a plain INSERT script, not a re-run of
// the original seed's `main()`, which would duplicate the other six
// providers' already-live camps. Same "reviewed real system, not an assumed
// policy" rigor as every provider in the main file (see its Data sourcing
// quality checklist) — every single date below was individually confirmed
// by querying the real Sawyer calendar (?date=YYYY-MM-DD lands directly on
// that day), not inferred from a stated recurring policy. This is the first
// provider with real per-specific-date confirmation for every seeded
// non-summer break date (no earliestConfirmedDate gap at all) — Sawyer's
// calendar is a real, queryable system, unlike ClimbZone/Fit City Kids'
// portal-gated dates or BitSpace/Park District's JS-only widgets that never
// actually populate (confirmed 2026-08-05 by rendering BitSpace's page with
// a real headless browser — see git history/conversation for the
// screenshot — its calendar is still stuck on "Loading the calendar…
// Please wait." even with full JS execution, not a static-fetch gap).
//
// Real findings, all confirmed by querying the live calendar for the
// specific date:
// - "NO SCHOOL CAMP": every single-day non-attendance date in this app's
//   calendar has a real listed session — Sep 25, Nov 2, Nov 3, Nov 11,
//   Jan 4, Jan 29, Feb 23, Apr 6, Apr 12. Morning 9:00am-1:00pm (ages
//   5-13) is $65/day; Afternoon 1:30pm-5:00pm (ages 4-12) is $55/day;
//   their own page says registering both bridges the midday gap into one
//   continuous 9:00am-5:00pm day — $120/day total, the max-time price
//   used below (same "compact line shows the full max-time total" rule
//   ClimbZone follows).
// - "THANKSGIVING": real listed sessions exist Nov 23-25 (as "NO SCHOOL
//   CAMP", not a distinctly-named Thanksgiving camp) but NOT Nov 26-27
//   (Thanksgiving Day itself and the day after — studio is closed) —
//   narrower than the full CPS Nov 23-27 break, same
//   partial-break-coverage shape as Lake View YMCA's Nov 23-24 override.
// - "WINTER BREAK ART CAMP": real listed sessions Dec 21-23 and Dec 28-30,
//   but NOT Dec 24 (Christmas Eve) or Dec 31-Jan 1 (New Year's) — a gap in
//   the middle of the range, not a single trimmed sub-range, so this is
//   generated as two separate camp rows below rather than one.
// - "SPRING BREAK ART CAMP": real listed sessions for the full CPS Spring
//   Break week, Mar 22-26 — no gap.
// All three programs price identically: Morning $65/day, Afternoon
// $55/day, full bridged day $120/day, 9:00am-5:00pm.

const ADDRESS = '2059 W Belmont Ave, Chicago, IL 60618'
// Hand-estimated from Chicago's street grid (8 blocks = 1 mile), same
// convention as every other coordinate in seed-2026-08-04-providers.ts —
// not a live geocoding call. Belmont Ave (3200 N) and 2059 W (just west of
// Damen/2000 W) puts this about 1.9 miles from Nettelhorst, well inside the
// existing 5-mile radius.
const LAT = 41.936
const LNG = -87.68

const SOURCE_URL = 'https://www.hisawyer.com/uni-coi-art-studio/schedules/widget_calendar?schedule_id=all'
const PRICE_PER_DAY = '120.00'
// One tier/note per line, reusing the stat line's own "Label: value · Label:
// value" convention — see seed-2026-08-04-providers.ts's ProviderSpec
// priceDetails doc comment for the full house-style rationale (feedback,
// 2026-08-05: mixed colons/parens/commas read as "haphazard"). Morning/
// afternoon age ranges are kept here (unlike a plain age restatement)
// because they're genuinely narrower than the camp's own 5-12 ageMin/ageMax
// below (the full-day-covering range — see AGE_MIN/AGE_MAX), not a
// duplicate of it.
const PRICE_DETAILS = [
  'Morning: 9:00 AM – 1:00 PM · $65/day · Ages 5-13',
  'Afternoon: 1:30 PM – 5:00 PM · $55/day · Ages 4-12',
  'Full day (register both): 9:00 AM – 5:00 PM · $120/day',
  'Weekly rates also available (vary by camp series)',
].join('\n')
const BOOKING_INSTRUCTIONS = 'Register online via the Sawyer booking calendar — choose Morning, Afternoon, or both for a full day.'
const PREP_INSTRUCTIONS =
  'Pack a labeled lunch and a water bottle. Art projects can get messy — dress for it or bring a smock/old shirt. ' +
  'Weather permitting, campers walk to nearby Hamlin Park for outdoor time.'
// No venue name or age range here — the title already says "Unicoi Art
// Studio" and age_min/age_max already show the range in the always-visible
// stat line (feedback, 2026-08-05, from a screenshot: the description
// literally started with the venue name a second time, right under the
// title that already said it).
const DESCRIPTION = 'Free play, structured art projects, and (weather permitting) park time.'
// The range that covers the FULL bridged day (9am-5pm), i.e. the
// intersection of Morning's 5-13 and Afternoon's 4-12 — not the union
// (feedback, 2026-08-05: "Unicoi's age range should be... five to twelve
// since that is the option that covers the full day"). The wider per-tier
// ranges stay visible in PRICE_DETAILS above.
const AGE_MIN = 5
const AGE_MAX = 12

interface DateRange {
  startDate: string
  endDate: string
}

// Every non-summer break date this app's calendar tracks, with Unicoi's own
// real confirmed coverage substituted in where it's narrower than the full
// break (Thanksgiving, Winter Break) — see header notes above for how each
// was confirmed.
const RANGES: DateRange[] = [
  { startDate: '2026-09-25', endDate: '2026-09-25' }, // Professional Development Day
  { startDate: '2026-11-02', endDate: '2026-11-03' }, // Parent-Teacher Conference Day & Election Day
  { startDate: '2026-11-11', endDate: '2026-11-11' }, // Professional Development Day
  { startDate: '2026-11-23', endDate: '2026-11-25' }, // Thanksgiving Break — real coverage, not the full Nov 23-27
  { startDate: '2026-12-21', endDate: '2026-12-23' }, // Winter Break, week 1 — real coverage
  { startDate: '2026-12-28', endDate: '2026-12-30' }, // Winter Break, week 2 — real coverage (gap at Dec 24, 31, Jan 1)
  { startDate: '2027-01-04', endDate: '2027-01-04' }, // Professional Development Day
  { startDate: '2027-01-29', endDate: '2027-01-29' }, // Professional Development Day
  { startDate: '2027-02-23', endDate: '2027-02-23' }, // Professional Development Day
  { startDate: '2027-03-22', endDate: '2027-03-26' }, // Spring Break — full coverage
  { startDate: '2027-04-06', endDate: '2027-04-06' }, // Professional Development Day
  { startDate: '2027-04-12', endDate: '2027-04-12' }, // Parent-Teacher Conference Day
]

function distanceFromNettelhorst(): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, LAT, LNG).toFixed(2)
}

async function main() {
  const [existingSource] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, 'Unicoi Art Studio'))
  if (existingSource) {
    console.log('Unicoi Art Studio source already exists — aborting to avoid duplicates.')
    return
  }

  const [source] = await db
    .insert(campSources)
    .values({
      name: 'Unicoi Art Studio',
      url: SOURCE_URL,
      type: 'provider_website',
      isActive: true,
      notes:
        'Real, live Sawyer booking calendar (hisawyer.com/uni-coi-art-studio) — every seeded date below was individually ' +
        'confirmed by querying the calendar for that specific date, not inferred from a stated policy. Three camp series: ' +
        '"No School Camp" (single non-attendance days), "Winter Break Art Camp", "Spring Break Art Camp" — all price ' +
        'identically. Thanksgiving coverage is Nov 23-25 only (closed Nov 26-27); Winter Break coverage is Dec 21-23 and ' +
        'Dec 28-30 (closed Dec 24, 31, and Jan 1).',
    })
    .returning({ id: campSources.id })

  // Facebook alone (tried first, per every other provider's precedent) had
  // no usable og:image for this page — real fix landed in
  // backfill-2026-08-05-cleanup.ts, which re-ran enrichment against
  // unicoistudio.com/about-us/ too (a real WordPress photo lives there) once
  // enrichCampSourceImage started accepting multiple candidate pages. Left
  // here as single-URL for historical accuracy — this script has an
  // existing-source guard and won't be re-run.
  const image = await enrichCampSourceImage(['https://www.facebook.com/UnicoiStudio/'])
  console.log(image ? 'Found a real image via Facebook' : 'No usable image found')

  const distanceMiles = distanceFromNettelhorst()

  const inserted = await db
    .insert(camps)
    .values(
      RANGES.map((range) => ({
        title: 'Unicoi Art Studio',
        description: DESCRIPTION,
        startDate: range.startDate,
        endDate: range.endDate,
        startTime: '09:00',
        endTime: '17:00',
        address: ADDRESS,
        latitude: LAT.toFixed(6),
        longitude: LNG.toFixed(6),
        distanceMiles,
        pricePerDay: PRICE_PER_DAY,
        priceIsEstimated: false,
        priceDetails: PRICE_DETAILS,
        ageMin: AGE_MIN,
        ageMax: AGE_MAX,
        spotsAvailable: null,
        bookingInstructions: BOOKING_INSTRUCTIONS,
        prepInstructions: PREP_INSTRUCTIONS,
        sourceUrl: SOURCE_URL,
        sourceId: source.id,
        imageUrl: image?.imageUrl ?? null,
        thumbnailUrl: image?.thumbnailUrl ?? null,
        status: 'approved' as const,
      })),
    )
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'claude:camps-unicoi-2026-08-05',
    action: 'camps_seeded',
    metadata: { sourceCount: 1, campCount: inserted.length, provider: 'Unicoi Art Studio' },
  })

  console.log(`Seeded Unicoi Art Studio: 1 source, ${inserted.length} camps.`)
}

await main()
process.exit(0)
