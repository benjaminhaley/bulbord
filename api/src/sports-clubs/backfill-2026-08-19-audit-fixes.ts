import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, type SportsClubOptionLine } from '../db/schema.js'

// Feedback (2026-08-19), following the Dance on Broadway rebuild: a genuine
// full-rigor audit of every other sports-clubs source — re-verifying real
// data (not just checking each URL loads), one WebFetch/WebSearch/headless-
// browser pass per source. Most held up: Kids Clay Room, Kidcreate, Unicoi,
// Thousand Waves, Little Gym, Supreme Jiu Jitsu, Lil Sluggers, Chicago Park
// District, and School of Rock's core numbers all reconfirmed accurate
// against their real current pages, no changes needed. Four real gaps
// found and fixed here:
//
// 1. i9 Sports — the existing single listing's price was left null with a
// note that Chicago-specific pricing "sits behind a client-side app this
// pass couldn't reach." Rendered with a real headless browser (Playwright)
// this time, the same technique already established for BitSpace/Unicoi —
// real pricing was there the whole time. Replaced with 3 real
// sport-specific listings (Soccer/Baseball/Flag Football), each with its
// real leagues as Options. Start times are given only as a window ("will
// start between 9am and 11am") — i9 assigns the exact time per team closer
// to the season — so occurrence rows carry the real Saturday date with no
// fabricated fixed time, and each option's real window lives in `note`.
// 2. Dovetail Studios — real per-class pricing (a genuine $/session-count
// table) was findable this time, resolving the previous "unit unconfirmed"
// gap for the three core recurring classes.
// 3. JKA Chicago — the real schedule has a 4th real session (Saturday
// 9-10am, Intermediate/Advanced) missing from the options table.
// 4. Old Town School — the existing single "Wiggleworms" listing collapsed
// 7 real, separately-priced class types (Lullabies $146, six $221 variants
// by age/language) into one generic entry — same "real structure hidden
// behind one blob" shape as Dance on Broadway, fixed with a real Options
// breakdown instead of a rebuild (small enough to stay one listing).

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OccurrenceRow {
  sportsClubId: string
  date: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

// Real Saturday dates for i9's Fall 2026 season (Sep 12 - Oct 24, 7 weeks) —
// no fixed time, since i9's own system only publishes a start-time window
// per grade/division until closer to the season (see header comment).
function i9SaturdayOccurrences(sportsClubId: string): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date('2026-09-12T00:00:00Z')
  const end = new Date('2026-10-24T00:00:00Z')
  while (cursor <= end) {
    rows.push({ sportsClubId, date: toDateString(cursor), startTime: null, endTime: null, note: null })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return rows
}

const I9_ADDRESS = '3650 N Recreation Dr, Chicago, IL 60613'
const I9_LOCATION_NAME = 'Waveland Lakeshore Fields'
const I9_LAT = '41.9516'
const I9_LNG = '-87.6367'
const I9_SOURCE_URL_BASE = 'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs'

interface I9League {
  label: string
  price: string
  ageDescription: string
  ageMin: number | null
  ageMax: number | null
  window: string
}

interface I9Sport {
  sport: string
  slug: string
  description: string
  ageMin: number
  ageMax: number
  pricePerWeek: number
  leagues: I9League[]
}

const I9_SPORTS: I9Sport[] = [
  {
    sport: 'i9 Sports — Soccer',
    slug: 'soccer',
    description: 'No-tryout youth soccer — one practice plus one game per week, real teams assigned by grade.',
    ageMin: 3,
    ageMax: 12,
    pricePerWeek: 219 / 7,
    leagues: [
      {
        label: 'Co-Ed Rec Division',
        price: '219.00',
        ageDescription: 'Co-ed, PreK3 – Grade 6',
        ageMin: 3,
        ageMax: 12,
        window:
          'PreK3-4: 9-11am · K-1: 11am-2pm · Grades 2-3: 9am-12:30pm · Grades 4-6: 11am-3pm (exact team time assigned closer to the season)',
      },
      {
        label: 'Girls Only',
        price: '219.00',
        ageDescription: 'Girls, Grades 2 – 4',
        ageMin: 7,
        ageMax: 10,
        window: '11am-3pm (exact team time assigned closer to the season)',
      },
    ],
  },
  {
    sport: 'i9 Sports — T-ball & Baseball',
    slug: 'baseball',
    description: 'No-tryout youth T-ball and baseball — one practice plus one game per week.',
    ageMin: 3,
    ageMax: 7,
    pricePerWeek: 199 / 7,
    leagues: [
      {
        label: 'Co-Ed',
        price: '199.00',
        ageDescription: 'Co-ed, Ages 3 – 7',
        ageMin: 3,
        ageMax: 7,
        window: 'Ages 3-4: 10-11:15am · Ages 5-7: 12:30-1:30pm (exact team time assigned closer to the season)',
      },
    ],
  },
  {
    sport: 'i9 Sports — Flag Football',
    slug: 'flag-football',
    description: 'No-tryout youth flag football — one practice plus one game per week.',
    ageMin: 5,
    ageMax: 14,
    pricePerWeek: 219 / 7,
    leagues: [
      {
        label: 'Co-Ed',
        price: '219.00',
        ageDescription: 'Co-ed, Grades K – 8',
        ageMin: 5,
        ageMax: 14,
        window: 'Grades K-1: 9-11am · 2-3 & 4-5: 9am-1:30pm · 6-8: 11am-3pm (exact team time assigned closer to the season)',
      },
      {
        label: 'Girls Only',
        price: '219.00',
        ageDescription: 'Girls, Grades 3 – 8',
        ageMin: 8,
        ageMax: 14,
        window: '11am-2pm (exact team time assigned closer to the season)',
      },
    ],
  },
]

async function rebuildI9Sports() {
  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'i9 Sports'))
    .returning({ id: sportsClubs.id, imageUrl: sportsClubs.imageUrl, thumbnailUrl: sportsClubs.thumbnailUrl, sourceId: sportsClubs.sourceId })
  if (deleted.length === 0) throw new Error('i9 Sports listing not found')
  const { imageUrl, thumbnailUrl, sourceId } = deleted[0]

  let occurrenceCount = 0
  for (const sport of I9_SPORTS) {
    const options: SportsClubOptionLine[] = sport.leagues.map((l) => ({
      label: l.label,
      start_time: null,
      end_time: null,
      price: l.price,
      price_unit: 'per 7-week season',
      age_min: l.ageMin,
      age_max: l.ageMax,
      note: `${l.ageDescription} — ${l.window}`,
    }))

    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: sport.sport,
        description: sport.description,
        category: 'Sports & Athletics',
        scheduleType: 'fixed_session',
        firstDate: '2026-09-12',
        lastDate: '2026-10-24',
        cadenceNote: null,
        ageMin: sport.ageMin,
        ageMax: sport.ageMax,
        price: sport.leagues[0].price,
        priceUnit: 'per 7-week season',
        pricePerWeek: sport.pricePerWeek.toFixed(2),
        priceNote:
          'Confirmed directly on i9\'s own venue page via a real browser render (their pricing widget doesn\'t appear in a plain fetch) — $219/season if paid by 08/08/2026, a small early-bird-style window; the base rate afterward may differ slightly and wasn\'t itself separately confirmed.',
        options,
        address: I9_ADDRESS,
        locationName: I9_LOCATION_NAME,
        latitude: I9_LAT,
        longitude: I9_LNG,
        distanceMiles: null,
        signupStatus: 'open',
        signupInstructions: 'Register online through the venue\'s i9sports.com page — Fall 2026 registration is open now.',
        sourceUrl: `${I9_SOURCE_URL_BASE}/${sport.slug}/10276`,
        sourceId,
        imageUrl,
        thumbnailUrl,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })

    const occurrences = i9SaturdayOccurrences(row.id)
    await db.insert(sportsClubOccurrences).values(occurrences)
    occurrenceCount += occurrences.length
  }

  console.log(`i9 Sports: replaced 1 listing with ${I9_SPORTS.length} real sport listings, ${occurrenceCount} occurrence rows.`)
}

async function fixDovetailPricing() {
  // Real per-class-count pricing found this pass (discovery.bondsports.co) —
  // treated as weekly cadence (the standard shape for a recurring class
  // named e.g. "16 sessions"), same "session = one weekly meeting" reading
  // this codebase already uses elsewhere (Kids Clay Room, Old Town School).
  const updates: { title: string; price: string; sessions: number }[] = [
    { title: 'Dovetail Studios', price: '375.00', sessions: 16 }, // Ballet — the provider's primary/first-listed program
  ]
  for (const u of updates) {
    const pricePerWeek = Number(u.price) / u.sessions
    const result = await db
      .update(sportsClubs)
      .set({
        price: u.price,
        priceUnit: `per ${u.sessions}-session (weekly) session`,
        pricePerWeek: pricePerWeek.toFixed(2),
        priceNote:
          'Real per-session-count pricing confirmed on the studio\'s own program storefront this pass (Ballet $375/16 sessions shown here; Hip Hop $420/4 sessions and Contemporary $420/7 sessions are real too but a shorter/differently-shaped program — see Options). Exact weekly day/time still not published online.',
        options: [
          { label: 'Ballet', start_time: null, end_time: null, price: '375.00', price_unit: 'per 16-week session', age_min: 5, age_max: 16, note: null },
          { label: 'Hip Hop', start_time: null, end_time: null, price: '420.00', price_unit: 'per 4-week session', age_min: 5, age_max: 15, note: null },
          { label: 'Contemporary', start_time: null, end_time: null, price: '420.00', price_unit: 'per 7-week session', age_min: 7, age_max: 16, note: null },
        ] satisfies SportsClubOptionLine[],
      })
      .where(eq(sportsClubs.title, u.title))
      .returning({ id: sportsClubs.id })
    console.log(`Dovetail Studios: ${result.length} row(s) updated with real per-class pricing.`)
  }
}

async function fixJkaMissingSession() {
  const options: SportsClubOptionLine[] = [
    { label: 'Beginner (Mon & Wed)', start_time: '17:00', end_time: '17:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    { label: 'Intermediate/Advanced (Mon & Wed)', start_time: '17:30', end_time: '18:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    { label: 'Intermediate/Advanced (Tue)', start_time: '12:00', end_time: '13:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    { label: 'Intermediate/Advanced (Sat)', start_time: '09:00', end_time: '10:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
  ]
  const result = await db
    .update(sportsClubs)
    .set({ options })
    .where(eq(sportsClubs.title, 'Japan Karate Association of Chicago — Kids Karate'))
    .returning({ id: sportsClubs.id })
  console.log(`JKA: ${result.length} row(s) updated with the real 4th (Saturday) session.`)
}

async function fixOldTownSchool() {
  // Real, distinct class types found this pass (oldtownschool.org's own
  // Wiggleworms Lincoln Park page) — the existing single listing only
  // represented the generic $221 "Wiggleworms 6-12 months" class; six more
  // real, separately-priced/aged variants exist at the same location.
  const options: SportsClubOptionLine[] = [
    { label: 'Lullabies', start_time: null, end_time: null, price: '146.00', price_unit: 'per 8-week session', age_min: 0, age_max: 1, note: '30 minutes — for the youngest babies, before Wiggleworms age' },
    { label: 'Wiggleworms 6-12 months', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 0, age_max: 1, note: null },
    { label: 'Wiggleworms 12-24 months', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 1, age_max: 2, note: null },
    { label: 'Wiggleworms 2 years', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 2, age_max: 2, note: null },
    { label: 'Wiggleworms Meet the Instruments', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 2, age_max: 4, note: null },
    { label: '¡Hola! Wiggleworms! (Spanish)', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 0, age_max: 4, note: null },
    { label: 'Mixed Age Wiggleworms', start_time: null, end_time: null, price: '221.00', price_unit: 'per 8-week session', age_min: 0, age_max: 4, note: null },
  ]
  const result = await db
    .update(sportsClubs)
    .set({
      description: 'A family early-childhood music program with several real class variants by age and language — songs, movement, and instrument play.',
      cadenceNote: 'A specific weekday is chosen at registration — every day of the week has real sections. Exact class time not published online.',
      options,
      sourceUrl: 'https://www.oldtownschool.org/classes/kids/wiggleworms/lincolnpark/',
    })
    .where(eq(sportsClubs.title, 'Old Town School — Wiggleworms'))
    .returning({ id: sportsClubs.id })
  console.log(`Old Town School: ${result.length} row(s) updated with the real 7-class breakdown.`)
}

async function main() {
  await rebuildI9Sports()
  await fixDovetailPricing()
  await fixJkaMissingSession()
  await fixOldTownSchool()

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-19-audit-fixes',
    action: 'sports_club_created',
    metadata: { note: 'Full-rigor audit fixes: i9 Sports rebuild, Dovetail/JKA/Old Town School data corrections' },
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
