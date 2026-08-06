import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog, type CampOptionLine, type CampPrepLine } from '../db/schema.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichCampSourceImage } from './image-enrichment.js'

// Two-provider addition for feedback #57 ("windy city ninjas / the trampoline
// park sky zone") — same standalone-insert shape as
// backfill-2026-08-05-unicoi.ts (scoped to just these two new providers, not
// a re-run of seed-2026-08-04-providers.ts's main(), which would duplicate
// the other seven providers' already-live camps).
//
// WINDY CITY NINJAS -> now ULTIMATE NINJAS: the name Ben used has since
// merged into a different brand — windycityninjas.com's own site explicitly
// says "WCN has merged and is now Ultimate Ninjas," pointing at
// ultimateninjas.com. Per the "use the provider's own most specific,
// correct listing" rule, this is seeded under their real current name and
// real current site, not the outdated one. Their Chicago location's real
// "Day-Off Camps" page (https://ultimateninjas.com/location/chicago/day-off-camps/)
// directly confirms a real recurring program with real pricing/hours/ages —
// Morning 9-12 ($65), Afternoon 12:30-3:30 ($65), Full Day 9-3:30 ($110),
// ages 5+ (no stated upper bound). That page embeds a Mindbody ("Branded
// Web") booking calendar to pick the actual date. Multiple genuine attempts
// to automate that specific calendar (headless browser, stepping the month
// picker to each of this app's non-summer-break dates) produced inconsistent
// results — the widget's date-selection didn't reliably register before
// results were read, so no specific date could be confirmed either open or
// closed this way. Unlike BitSpace/Chicago Park District (which had either
// an explicit "nothing open yet" disclaimer or no recurring-offering claim
// at all), Ultimate Ninjas makes a real, positive, specifically-priced
// recurring-offering claim — so this follows ClimbZone's original precedent
// (real stated policy + real pricing, exact dates behind a portal this
// codebase can't reliably query) rather than BitSpace's `hasRecurringOffering:
// false`: candidates are generated for every non-summer-break date, flagged
// in this source's own notes for a human to spot-check the live calendar
// directly, the same way Ben did for YMCA/Fit City Kids/ClimbZone.
//
// SKY ZONE: the nearest real Chicago-area location to Nettelhorst is Sky
// Zone Chicago Lincoln Park, 1419 N Kingsbury St (a new ~2026-opened 38,000
// sq ft park, per Sky Zone's own announcement) — closer than Sky Zone's
// other four Chicago-area locations (Midway, Deerfield, Alsip, Algonquin).
// Its own /programs/ page lists only Members Only Night, Memberships,
// Birthday Parties, and Jump Tickets — no camp or day-program of any kind —
// and /programs/skycamp/ (the path several other Sky Zone locations, e.g.
// Chalfont PA and Glen Mills PA, use for a real "SKY CAMP" program) 404s
// here. Nothing at all is confirmed, the same "hasRecurringOffering: false"
// shape as BitSpace/Chicago Park District — inserted as a real camp_sources
// row (camp_count: 0), ready to be populated if this location ever adds one.

interface DateRange {
  startDate: string
  endDate: string
}

// Every non-summer break date this app's calendar tracks (same set
// backfill-2026-08-05-unicoi.ts used) — see that file for why summer is
// excluded (every hand-seeded provider pass so far has scoped to non-summer
// breaks only).
const RANGES: DateRange[] = [
  { startDate: '2026-09-25', endDate: '2026-09-25' }, // Professional Development Day
  { startDate: '2026-11-02', endDate: '2026-11-03' }, // Parent-Teacher Conference Day & Election Day
  { startDate: '2026-11-11', endDate: '2026-11-11' }, // Professional Development Day
  { startDate: '2026-11-23', endDate: '2026-11-27' }, // Thanksgiving Break
  { startDate: '2026-12-21', endDate: '2027-01-01' }, // Winter Break
  { startDate: '2027-01-04', endDate: '2027-01-04' }, // Professional Development Day
  { startDate: '2027-01-29', endDate: '2027-01-29' }, // Professional Development Day
  { startDate: '2027-02-23', endDate: '2027-02-23' }, // Professional Development Day
  { startDate: '2027-03-22', endDate: '2027-03-26' }, // Spring Break
  { startDate: '2027-04-06', endDate: '2027-04-06' }, // Professional Development Day
  { startDate: '2027-04-12', endDate: '2027-04-12' }, // Parent-Teacher Conference Day
]

const NINJAS_ADDRESS = '2500 W Bradley Place, Chicago, IL 60618'
// Hand-estimated from Chicago's street grid (Bradley Place = 3732 N,
// Nettelhorst = 3252 N Broadway ≈ 620 W — same non-geocoded convention as
// every other provider's coordinates in this file's siblings), ~2.4 miles
// from Nettelhorst, well inside the existing 5-mile radius.
const NINJAS_LAT = 41.9504
const NINJAS_LNG = -87.6906
const NINJAS_SOURCE_URL = 'https://ultimateninjas.com/location/chicago/day-off-camps/'
const NINJAS_PRICE_PER_DAY = '110.00' // full-day total — the most expansive real option, matching every other provider's convention
const NINJAS_AGE_MIN = 5
const NINJAS_AGE_MAX = null
const NINJAS_START_TIME = '09:00'
const NINJAS_END_TIME = '15:30'
const NINJAS_DESCRIPTION =
  'Obstacle-course training inspired by the TV show, plus free play and team games — with a chance to run the full course at the end.'
const NINJAS_BOOKING_INSTRUCTIONS = 'Create a parent account online, then book a date via the calendar.'
const NINJAS_OPTIONS: CampOptionLine[] = [
  { label: 'Full Day', start_time: '09:00', end_time: '15:30', price: '110.00', age_min: 5, age_max: null, note: null },
  { label: 'Morning', start_time: '09:00', end_time: '12:00', price: '65.00', age_min: 5, age_max: null, note: null },
  { label: 'Afternoon', start_time: '12:30', end_time: '15:30', price: '65.00', age_min: 5, age_max: null, note: null },
]
const NINJAS_PREP_ITEMS: CampPrepLine[] = [
  { label: 'Food and drink', detail: 'a snack and water bottle — full-day campers should bring a lunch too' },
  { label: 'Closed-toed shoes', detail: 'required for all obstacle activities' },
]

const SKYZONE_NAME = 'Sky Zone Chicago Lincoln Park'
// Address (1419 N Kingsbury St, Chicago, IL 60642) and hand-estimated
// coordinates (41.9095, -87.6535 — roughly 4 miles from Nettelhorst, still
// inside the 5-mile radius) are recorded here in prose, not as camps-row
// columns, since there's nowhere to put them while camp_count is 0 — reuse
// these exact values if this source ever gets its first real camp.
const SKYZONE_URL = 'https://www.skyzone.com/chicago-lincoln-park-il/programs/'

function distanceFromNettelhorst(lat: number, lng: number): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, lat, lng).toFixed(2)
}

async function seedUltimateNinjas() {
  const [existing] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, 'Ultimate Ninjas'))
  if (existing) {
    console.log('Ultimate Ninjas source already exists — skipping.')
    return
  }

  const [source] = await db
    .insert(campSources)
    .values({
      name: 'Ultimate Ninjas',
      url: NINJAS_SOURCE_URL,
      type: 'provider_website',
      isActive: true,
      notes:
        'Formerly "Windy City Ninjas" — their own site says WCN merged into Ultimate Ninjas; seeded under the current real ' +
        'name/site. Real "Day-Off Camps" page confirms pricing/hours/ages for a recurring non-attendance-day program ' +
        '(Morning $65, Afternoon $65, Full Day $110, ages 5+), but the specific date-by-date booking calendar is a Mindbody ' +
        'widget this codebase could not reliably automate-query (inconsistent results across several attempts) — worth a ' +
        'quick manual spot-check of a couple of these dates on the live page, same as Ben did for YMCA/Fit City Kids/ClimbZone.',
    })
    .returning({ id: campSources.id })

  const image = await enrichCampSourceImage([NINJAS_SOURCE_URL, 'https://www.facebook.com/ultimateninjaschi/'])
  console.log(image ? 'Ultimate Ninjas: found a real image' : 'Ultimate Ninjas: no usable image found')

  const distanceMiles = distanceFromNettelhorst(NINJAS_LAT, NINJAS_LNG)

  const inserted = await db
    .insert(camps)
    .values(
      RANGES.map((range) => ({
        title: 'Ultimate Ninjas',
        description: NINJAS_DESCRIPTION,
        startDate: range.startDate,
        endDate: range.endDate,
        startTime: NINJAS_START_TIME,
        endTime: NINJAS_END_TIME,
        address: NINJAS_ADDRESS,
        latitude: NINJAS_LAT.toFixed(6),
        longitude: NINJAS_LNG.toFixed(6),
        distanceMiles,
        pricePerDay: NINJAS_PRICE_PER_DAY,
        priceIsEstimated: false,
        options: NINJAS_OPTIONS,
        optionsNote: null,
        ageMin: NINJAS_AGE_MIN,
        ageMax: NINJAS_AGE_MAX,
        spotsAvailable: null,
        bookingInstructions: NINJAS_BOOKING_INSTRUCTIONS,
        prepItems: NINJAS_PREP_ITEMS,
        sourceUrl: NINJAS_SOURCE_URL,
        sourceId: source.id,
        imageUrl: image?.imageUrl ?? null,
        thumbnailUrl: image?.thumbnailUrl ?? null,
        status: 'approved' as const,
      })),
    )
    .returning({ id: camps.id })

  console.log(`Seeded Ultimate Ninjas: 1 source, ${inserted.length} camps.`)
  return inserted.length
}

async function seedSkyZone() {
  const [existing] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, SKYZONE_NAME))
  if (existing) {
    console.log('Sky Zone source already exists — skipping.')
    return 0
  }

  await db.insert(campSources).values({
    name: SKYZONE_NAME,
    url: SKYZONE_URL,
    type: 'provider_website',
    isActive: true,
    notes:
      'Nearest real Chicago-area Sky Zone location to Nettelhorst (1419 N Kingsbury St, Chicago, IL 60642 — hand-estimated ' +
      'coordinates 41.9095, -87.6535, ~4 miles from Nettelhorst, inside the 5-mile radius). Its own /programs/ page lists ' +
      'only Members Only Night, Memberships, Birthday Parties, and Jump Tickets — no camp or day program of any kind — and ' +
      '/programs/skycamp/ (the path other Sky Zone locations use for a real SKY CAMP program) 404s here. Nothing confirmed ' +
      'open at all, same treatment as BitSpace/Chicago Park District — inserted with zero camps, ready to populate with the ' +
      'address/coordinates above if this location ever adds one.',
  })

  console.log('Seeded Sky Zone Chicago Lincoln Park: 1 source, 0 camps (nothing confirmed open).')
  return 0
}

async function main() {
  const ninjasCount = (await seedUltimateNinjas()) ?? 0
  const skyzoneCount = await seedSkyZone()

  await db.insert(eventsLog).values({
    actor: 'claude:camps-ninjas-skyzone-2026-08-06',
    action: 'camps_seeded',
    metadata: { sourceCount: 2, campCount: ninjasCount + skyzoneCount, providers: ['Ultimate Ninjas', SKYZONE_NAME] },
  })
}

await main()
process.exit(0)
