import 'dotenv/config'

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { camps, campSources, eventsLog } from '../db/schema.js'
import type { CampOptionLine, CampPrepLine } from '../db/schema.js'

// Feedback #130 (2026-09-03): Indigenous Peoples' Day, MLK Jr. Day, and
// Presidents' Day are no longer excluded from the camp calendar (see
// backfill-2026-09-03-restore-three-holidays.ts, which added the three new
// school_breaks rows this script generates real camps for). This mirrors
// exactly how seed-2026-08-04-providers.ts's own `candidates` computation
// would have generated these rows automatically had these three dates been
// in school_breaks from the start — same per-provider content (title,
// description, price, options, prep items, address), just a new startDate/
// endDate, and reusing each provider's *already-uploaded* venue photo
// (queried below) rather than re-fetching one.
//
// Per-provider inclusion follows this codebase's own established rules —
// re-verified live for this pass rather than assumed, per the Camps
// section's sourcing checklist:
// - Lake View YMCA: real recurring "School Days Out" program
//   (earliestConfirmedDate 2026-10-12, so all three new dates qualify under
//   that original gate) — included on all three. booking_status set to
//   'not_opened', matching the more recent 2026-08-13 live re-check of their
//   real Salesforce/TractionRec portal (which supersedes the original
//   Oct-12-is-open finding — see backfill-2026-08-13-booking-status.ts's own
//   comment), not the older earliestConfirmedDate assumption.
// - ClimbZone Chicago: included on all three (no earliestConfirmedDate
//   gate). booking_status: re-verified live just now via their real public
//   iClassPro API (app.iclasspro.com/api/open/v1/climbzonechicago/camps) —
//   still `{"data":[],"message":"No camps found."}`, i.e. not_opened by
//   default — EXCEPT Oct 12, which Ben directly confirmed open (feedback
//   #112, 2026-08-20: "all camps should be open through Thanksgiving") —
//   Oct 12 falls before the Nov 23-27 Thanksgiving break this covered, so it
//   gets 'open' same as every other pre-Thanksgiving ClimbZone camp; Jan 18
//   and Feb 15 fall after Thanksgiving, outside that override's own stated
//   scope, so they stay 'not_opened' per the live re-check.
// - Fit City Kids: included on all three (earliestConfirmedDate 2026-09-25).
//   booking_status: freshly re-verified live via their real public Jackrabbit
//   Openings list (app.jackrabbitclass.com/jr3.0/Openings/OpeningsDirect?
//   OrgID=538382) — real "School's Out Camp October 12th/January 18th/
//   February 15th" + "After Camp" sessions exist for all three dates with
//   real open seat counts (32/84/86 for the day-camp block), same $85/$120
//   pricing as every other seeded date — 'open' on all three.
// - Family Room Chicago (Broadway): included on all three (no
//   earliestConfirmedDate gate). booking_status: 'open' on all three per
//   Ben's direct confirmation (feedback #113, 2026-08-20: "all the way
//   through June 11, 2027") — all three new dates fall within that window.
// - Unicoi Art Studio: included on all three. booking_status: freshly
//   re-verified live via their real Sawyer API
//   (hisawyer.com/api/v1/widget/calendar_scheduled_activities) for Oct 12
//   and Jan 18 specifically — both show the real recurring "NO SCHOOL CAMP
//   (Morning/Afternoon)" activity with real open_spots_count (24/20 and
//   30/25). Feb 15 hit Cloudflare's bot-check on repeated requests in the
//   same short window (a third rapid request in a row looked too automated
//   to it) rather than returning a real result — NOT independently
//   confirmed the same way. Included as 'open' anyway on the strength of
//   the other two: both confirmed occurrences are the exact same recurring
//   weekly activity (calendarId 1966619/1966624), whose own API response
//   states its real range as every Monday from Sep 25, 2026 through Apr 12,
//   2027 — Feb 15, 2027 is a Monday inside that same stated range. This is
//   an inference from a confirmed recurring series, not an independently
//   re-fetched result for that specific date — flagged here honestly rather
//   than claiming the same rigor as the other two dates.
// - Ultimate Ninjas: included on all three (no earliestConfirmedDate gate,
//   real positively-stated "Day-Off Camps" program). booking_status:
//   'not_opened', unchanged from the 2026-08-06/2026-08-13 live Mindbody
//   widget checks (which found nothing available for any of the original 11
//   dates) — no reason found to expect this changed for these three.
// - BitSpace, Chicago Park District, Sky Zone: excluded entirely, same as
//   every other non-attendance day — no real confirmed camp program exists
//   at any of the three (hasRecurringOffering: false equivalent).

interface NewCampSpec {
  sourceName: string
  title: string
  description: string
  address: string
  lat: number
  lng: number
  distanceMiles: string
  ageMin: number | null
  ageMax: number | null
  startTime: string | null
  endTime: string | null
  pricePerDay: string | null
  priceIsEstimated: boolean
  options: CampOptionLine[] | null
  optionsNote: string | null
  bookingInstructions: string
  prepItems: CampPrepLine[] | null
  sourceUrl: string
}

const DATES = ['2026-10-12', '2027-01-18', '2027-02-15']

const YMCA: NewCampSpec = {
  sourceName: 'Lake View YMCA',
  title: 'Lake View YMCA',
  description: '"School Days Out" — a full day of activities while school is out.',
  address: '3333 N Marshfield Ave, Chicago, IL 60657',
  lat: 41.9422,
  lng: -87.6692,
  distanceMiles: '1.26', // corrected from an initial 0.00 placeholder — see fix note below
  ageMin: 5,
  ageMax: 13,
  startTime: '07:00',
  endTime: '18:00',
  pricePerDay: '70.00',
  priceIsEstimated: false,
  options: [{ label: 'Full day', start_time: '07:00', end_time: '18:00', price: '70.00', age_min: 5, age_max: 13, note: null }],
  optionsNote: null,
  bookingInstructions: 'Register online, by phone (773-248-3333), or in person at the front desk.',
  prepItems: [
    { label: 'Food and drink', detail: 'a lunch and a water bottle (no glass)' },
    { label: 'Swimsuit and towel', detail: 'if the day includes pool time' },
    { label: 'Comfortable clothes', detail: 'for active play' },
  ],
  sourceUrl: 'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/',
}

const CLIMBZONE: NewCampSpec = {
  sourceName: 'ClimbZone Chicago',
  title: 'ClimbZone Chicago',
  description: 'Full-day camp — climbing walls, high ropes, laser tag, and arts and crafts.',
  address: '2500 W Bradley Pl, Chicago, IL 60618',
  lat: 41.9398,
  lng: -87.6886,
  distanceMiles: '2.26',
  ageMin: 5,
  ageMax: 12,
  startTime: '09:00',
  endTime: '17:30',
  pricePerDay: '150.00',
  priceIsEstimated: false,
  options: [
    { label: 'Full day', start_time: '09:00', end_time: '15:30', price: '120.00', age_min: 5, age_max: 12, note: null },
    { label: 'Full day + aftercare', start_time: '09:00', end_time: '17:30', price: '150.00', age_min: 5, age_max: 12, note: null },
    { label: 'Morning half-day', start_time: '09:00', end_time: '12:00', price: '70.00', age_min: 5, age_max: 12, note: null },
    { label: 'Afternoon half-day', start_time: '12:30', end_time: '15:30', price: '70.00', age_min: 5, age_max: 12, note: null },
  ],
  optionsNote: 'Weekly rates also available: $540 (full day), $320 (half-day). 5% sibling discount available.',
  bookingInstructions: 'Sign up online for whichever day(s) you need — no minimum required.',
  prepItems: [
    { label: 'Footwear', detail: 'sneakers or gym shoes' },
    { label: 'Grip socks', detail: 'required in the soft-play area — bring your own or buy a pair on-site' },
    { label: 'Lunch', detail: 'or pre-order one from ClimbZone for $10/child' },
  ],
  sourceUrl: 'https://www.climbzone.us/chicago/camps/',
}

const FITCITYKIDS: NewCampSpec = {
  sourceName: 'Fit City Kids',
  title: 'Fit City Kids',
  description: 'Fitness classes and active play.',
  address: '2540 W Lawrence Ave, Chicago, IL 60625',
  lat: 41.9688,
  lng: -87.6894,
  distanceMiles: '2.96',
  ageMin: 4,
  ageMax: 12,
  startTime: '08:00',
  endTime: '18:00',
  pricePerDay: '120.00',
  priceIsEstimated: false,
  options: [
    { label: 'Day camp', start_time: '08:00', end_time: '15:00', price: '85.00', age_min: null, age_max: null, note: null },
    {
      label: 'Full day + after-camp extension',
      start_time: '08:00',
      end_time: '18:00',
      price: '120.00',
      age_min: null,
      age_max: null,
      note: null,
    },
  ],
  optionsNote: null,
  bookingInstructions: 'Register through the parent portal. Email Camps@FitCityKids.com if your date isn\'t listed.',
  prepItems: [
    { label: 'Footwear', detail: 'gym shoes and socks' },
    { label: 'Food and drink', detail: 'a labeled water bottle, a snack, and a lunch' },
  ],
  sourceUrl: 'https://www.fitcitykids.com/schools-out-camp/',
}

const FAMILYROOM: NewCampSpec = {
  sourceName: 'Family Room Chicago (Broadway)',
  title: 'Family Room Chicago (Broadway)',
  description: 'Supervised sports, free play, and creative activities with a 10:1 camper-to-staff ratio.',
  address: '3229 N Broadway, Chicago, IL 60657',
  lat: 41.94125,
  lng: -87.6447,
  distanceMiles: '0.03',
  ageMin: 0,
  ageMax: null,
  startTime: '07:00',
  endTime: '18:00',
  pricePerDay: '95.00',
  priceIsEstimated: false,
  options: [
    { label: 'Express Pass', start_time: '07:00', end_time: '18:00', price: '45.00', age_min: null, age_max: null, note: '3 hours' },
    { label: 'Half-Day Pass', start_time: '07:00', end_time: '18:00', price: '65.00', age_min: null, age_max: null, note: '5 hours' },
    { label: 'Full-Day Pass', start_time: '07:00', end_time: '18:00', price: '95.00', age_min: null, age_max: null, note: '9 hours' },
  ],
  optionsNote: null,
  bookingInstructions: 'Book online and pick a date.',
  prepItems: [{ label: 'Nothing to pack', detail: 'healthy snacks and a whole-food lunch are included for the day.' }],
  sourceUrl:
    'https://familyroomchicago.com/shop/camp/day-camp/one-day-camp/family-room-day-camp-single-day-drop-in-pass-lakeview-east/',
}

const UNICOI: NewCampSpec = {
  sourceName: 'Unicoi Art Studio',
  title: 'Unicoi Art Studio',
  description:
    'Spend your day off school getting Creative with Unicoi! Campers enjoy a mix of freeplay, structured art projects, and park time.',
  address: '2059 W Belmont Ave, Chicago, IL 60618',
  lat: 41.9394,
  lng: -87.6797,
  distanceMiles: '1.90',
  ageMin: 5,
  ageMax: 12,
  startTime: '09:00',
  endTime: '17:00',
  pricePerDay: '120.00',
  priceIsEstimated: false,
  options: [
    { label: 'Morning', start_time: '09:00', end_time: '13:00', price: '65.00', age_min: 4, age_max: 13, note: null },
    { label: 'Afternoon', start_time: '13:30', end_time: '17:00', price: '55.00', age_min: 4, age_max: 12, note: null },
    { label: 'Full day (morning + afternoon)', start_time: '09:00', end_time: '17:00', price: '120.00', age_min: 4, age_max: 13, note: null },
  ],
  optionsNote: null,
  bookingInstructions: 'Book online via the Sawyer calendar.',
  prepItems: [{ label: 'Snack or lunch', detail: 'for a full day, since morning and afternoon camp are bridged by a snack break' }],
  sourceUrl: 'https://www.hisawyer.com/uni-coi-art-studio/schedules/widget_calendar?schedule_id=all',
}

const ULTIMATE_NINJAS: NewCampSpec = {
  sourceName: 'Ultimate Ninjas',
  title: 'Ultimate Ninjas',
  description:
    'Obstacle-course training inspired by the TV show, plus free play and team games — with a chance to run the full course at the end.',
  address: '2500 W Bradley Place, Chicago, IL 60618',
  lat: 41.9504,
  lng: -87.6906,
  distanceMiles: '2.40',
  ageMin: 5,
  ageMax: null,
  startTime: '09:00',
  endTime: '15:30',
  pricePerDay: '110.00',
  priceIsEstimated: false,
  options: [
    { label: 'Full Day', start_time: '09:00', end_time: '15:30', price: '110.00', age_min: 5, age_max: null, note: null },
    { label: 'Morning', start_time: '09:00', end_time: '12:00', price: '65.00', age_min: 5, age_max: null, note: null },
    { label: 'Afternoon', start_time: '12:30', end_time: '15:30', price: '65.00', age_min: 5, age_max: null, note: null },
  ],
  optionsNote: null,
  bookingInstructions: 'Create a parent account online, then book a date via the calendar.',
  prepItems: [
    { label: 'Food and drink', detail: 'a snack and water bottle — full-day campers should bring a lunch too' },
    { label: 'Closed-toed shoes', detail: 'required for all obstacle activities' },
  ],
  sourceUrl: 'https://ultimateninjas.com/location/chicago/day-off-camps/',
}

// Fix note: this script's first real run inserted YMCA/ClimbZone/Fit City
// Kids/Family Room's 12 new rows with a `'0.00'` distanceMiles placeholder
// (copy-paste leftover, never actually computed via haversineMiles the way
// seed-2026-08-04-providers.ts's own `distanceFromNettelhorst` does) — caught
// immediately in a post-insert visual QA screenshot ("0.0 mi" on camps that
// should read 1-3 mi), fixed via a one-off UPDATE against the already-live
// rows, and corrected here in the constants below so a future re-read of
// this file doesn't repeat the same wrong number. Unicoi/Ultimate Ninjas
// were unaffected — their distanceMiles was hand-copied correctly from the
// start.

// (spec, per-date booking_status) — booking_status varies by date only for
// ClimbZone (Ben's Thanksgiving-scoped override), so it's expressed as a
// function rather than a flat per-provider constant.
const PLAN: { spec: NewCampSpec; bookingStatus: (date: string) => 'open' | 'not_opened' }[] = [
  { spec: YMCA, bookingStatus: () => 'not_opened' },
  { spec: CLIMBZONE, bookingStatus: (date) => (date === '2026-10-12' ? 'open' : 'not_opened') },
  { spec: FITCITYKIDS, bookingStatus: () => 'open' },
  { spec: FAMILYROOM, bookingStatus: () => 'open' },
  { spec: UNICOI, bookingStatus: () => 'open' },
  { spec: ULTIMATE_NINJAS, bookingStatus: () => 'not_opened' },
]

async function main() {
  const rows: (typeof camps.$inferInsert)[] = []

  for (const { spec, bookingStatus } of PLAN) {
    const [source] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, spec.sourceName))
    if (!source) throw new Error(`camp_sources row not found for "${spec.sourceName}"`)

    // Reuse this provider's already-uploaded venue photo (same source, same
    // real image every one of their other camps already uses) instead of
    // re-fetching — a provider's photo doesn't vary by date.
    const [existingCamp] = await db
      .select({ imageUrl: camps.imageUrl, thumbnailUrl: camps.thumbnailUrl })
      .from(camps)
      .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
      .limit(1)
    if (!existingCamp) throw new Error(`No existing camp found to source an image from for "${spec.sourceName}"`)

    for (const date of DATES) {
      rows.push({
        title: spec.title,
        description: spec.description,
        startDate: date,
        endDate: date,
        address: spec.address,
        latitude: spec.lat.toFixed(6),
        longitude: spec.lng.toFixed(6),
        distanceMiles: spec.distanceMiles,
        startTime: spec.startTime,
        endTime: spec.endTime,
        pricePerDay: spec.pricePerDay,
        priceIsEstimated: spec.priceIsEstimated,
        options: spec.options,
        optionsNote: spec.optionsNote,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        spotsAvailable: null,
        bookingInstructions: spec.bookingInstructions,
        prepItems: spec.prepItems,
        bookingStatus: bookingStatus(date),
        sourceUrl: spec.sourceUrl,
        sourceId: source.id,
        imageUrl: existingCamp.imageUrl,
        thumbnailUrl: existingCamp.thumbnailUrl,
        status: 'approved' as const,
      })
    }
  }

  const inserted = await db.insert(camps).values(rows).returning({ id: camps.id, title: camps.title, startDate: camps.startDate })

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-09-03-camps-for-restored-holidays',
    action: 'camps_seeded',
    metadata: { campCount: inserted.length, reason: 'feedback #130' },
  })

  console.log(`Inserted ${inserted.length} camps:`)
  for (const row of inserted) console.log(`  ${row.startDate} — ${row.title}`)
}

await main()
process.exit(0)
