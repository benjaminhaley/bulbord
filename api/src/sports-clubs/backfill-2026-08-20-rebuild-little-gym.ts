import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Feedback (2026-08-20): "The Little Gym of Chicago" was another single,
// generic listing ("Age bands from 4 months through 12 years... grouped
// by age band") hiding real, separately-named class levels on its own
// site. Sourced from the studio's real weekly class calendar (an embedded
// Unleashed Brands widget with 3 real weeks of dated class instances,
// server-rendered — not a JS black box). Pricing is genuinely uniform
// across every class (by membership plan/frequency, not by class name),
// so every row below keeps the same real plan pricing the original single
// row already had. Only two real class types had exact, confirmed
// day/times (both Dance and the advanced Grade School tumbling class) —
// the rest are honestly marked "daily, various times" rather than a
// fabricated single slot. Three "combined" session variants the real
// calendar also showed (e.g. Beasts/Super Beasts run together) were left
// out as redundant with their two already-listed component classes,
// rather than adding near-duplicate rows with no distinct real info.

const ADDRESS = '3216 N Lincoln Ave, Chicago, IL 60657'
const LAT = '41.940300'
const LNG = '-87.665000'
const DISTANCE_MILES = '1.05'
const SOURCE_URL = 'https://www.thelittlegym.com/illinois-chicago/'
const PRICE = '160.00'
const PRICE_UNIT = 'per month (1 class/week, 12-month plan)'
const PRICE_PER_WEEK = '36.92'
const PRICE_NOTE = '$165/mo for a non-annual 1x/week plan; $297/mo for a 2x/week Premium plan. Pricing is the same across every class — by plan/frequency, not by class name.'

interface ClassSpec {
  className: string
  category: string
  ageMin: number
  ageMax: number
  description: string
  cadenceNote: string | null
  slots: { day: number; start: string; end: string }[]
}

const CLASSES: ClassSpec[] = [
  {
    className: 'Parent Child: Bugs',
    category: 'Sports & Athletics',
    ageMin: 0,
    ageMax: 0,
    description: 'A parent-and-child class introducing movement and gentle gymnastics play for the youngest infants.',
    cadenceNote: 'Weekly: Wednesdays 2:40–3:25pm, Fridays 12:05–12:50pm.',
    slots: [
      { day: 3, start: '14:40:00', end: '15:25:00' },
      { day: 5, start: '12:05:00', end: '12:50:00' },
    ],
  },
  {
    className: 'Parent Child: Birds',
    category: 'Sports & Athletics',
    ageMin: 0,
    ageMax: 1,
    description: 'A parent-and-child class introducing movement and gentle gymnastics play for infants.',
    cadenceNote: 'Several real weekly sessions nearly every day, 8:15am–3:50pm — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Parent Child: Beasts',
    category: 'Sports & Athletics',
    ageMin: 1,
    ageMax: 2,
    description: 'A parent-and-child class introducing movement and gentle gymnastics play for young toddlers.',
    cadenceNote: 'Several real weekly sessions nearly every day — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Parent Child: Super Beasts',
    category: 'Sports & Athletics',
    ageMin: 2,
    ageMax: 3,
    description: 'A parent-and-child class introducing movement and gentle gymnastics play for older toddlers.',
    cadenceNote: 'Several real weekly sessions nearly every day — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Pre/K: Funny Bugs',
    category: 'Sports & Athletics',
    ageMin: 3,
    ageMax: 4,
    description: 'Recreational, non-competitive gymnastics for preschoolers, building on the Parent Child program without a caregiver in class.',
    cadenceNote: 'Real weekly sessions daily — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Pre/K: Giggle Worms',
    category: 'Sports & Athletics',
    ageMin: 4,
    ageMax: 5,
    description: 'Recreational, non-competitive gymnastics for preschoolers.',
    cadenceNote: 'Real weekly sessions daily — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Pre/K: Good Friends',
    category: 'Sports & Athletics',
    ageMin: 5,
    ageMax: 6,
    description: 'Recreational, non-competitive gymnastics for the oldest preschoolers, preparing for the Grade School program.',
    cadenceNote: 'Real weekly sessions daily — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Dance: Pre-K Hip Hop/Jazz Funk',
    category: 'Dance',
    ageMin: 4,
    ageMax: 6,
    description: 'A non-competitive Hip Hop/Jazz Funk dance class for preschoolers.',
    cadenceNote: null,
    slots: [
      { day: 6, start: '10:30:00', end: '11:30:00' },
      { day: 0, start: '10:15:00', end: '11:15:00' },
    ],
  },
  {
    className: 'Grade School: Flips, Twisters & Hot Shots',
    category: 'Sports & Athletics',
    ageMin: 6,
    ageMax: 12,
    description: 'Beginner/intermediate recreational gymnastics for grade-school kids.',
    cadenceNote: 'Real weekly sessions daily — exact times vary; check the studio\'s live class calendar.',
    slots: [],
  },
  {
    className: 'Grade School: Aerials, Jets & Flic-Flacs',
    category: 'Sports & Athletics',
    ageMin: 6,
    ageMax: 12,
    description: 'Advanced recreational gymnastics for grade-school kids with prior experience.',
    cadenceNote: null,
    slots: [
      { day: 1, start: '18:35:00', end: '19:35:00' },
      { day: 0, start: '17:30:00', end: '18:30:00' },
    ],
  },
  {
    className: 'Tummy Timers',
    category: 'Sports & Athletics',
    ageMin: 0,
    ageMax: 0,
    description: 'A 10-week guided program for newborns to 4 months old — a separate program from the ongoing weekly class schedule.',
    cadenceNote: 'A 10-week guided program, not a standing weekly class — exact schedule and price not published; call the studio.',
    slots: [],
  },
]

const ONGOING_WINDOW_WEEKS = 12

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function main() {
  const [existing] = await db
    .select({ id: sportsClubs.id, sourceId: sportsClubs.sourceId })
    .from(sportsClubs)
    .where(eq(sportsClubs.title, 'The Little Gym of Chicago'))
  if (!existing?.sourceId) throw new Error('Existing The Little Gym listing (or its source_id) not found')
  const sourceId = existing.sourceId

  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'The Little Gym of Chicago'))
    .returning({ id: sportsClubs.id })
  console.log(`Soft-deleted ${deleted.length} old listing(s).`)

  const image = await enrichSportsClubSourceImage([SOURCE_URL, 'https://www.facebook.com/thelittlegymchicago'])
  const placeholder = image ? null : await uploadPlaceholderImage('The Little Gym', 'sportsclubs')

  const today = new Date()
  let insertedCount = 0
  let occurrenceCount = 0

  for (const spec of CLASSES) {
    const priceIsNull = spec.className === 'Tummy Timers'
    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: `The Little Gym — ${spec.className}`,
        description: spec.description,
        category: spec.category,
        scheduleType: 'ongoing',
        firstDate: null,
        lastDate: null,
        cadenceNote: spec.cadenceNote,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        price: priceIsNull ? null : PRICE,
        priceUnit: priceIsNull ? null : PRICE_UNIT,
        pricePerWeek: priceIsNull ? null : PRICE_PER_WEEK,
        priceNote: priceIsNull ? null : PRICE_NOTE,
        options: null,
        address: ADDRESS,
        locationName: 'The Little Gym',
        latitude: LAT,
        longitude: LNG,
        distanceMiles: DISTANCE_MILES,
        signupStatus: 'open',
        signupInstructions: 'Complete the online interest form — the studio follows up to enroll.',
        sourceUrl: SOURCE_URL,
        sourceId,
        imageUrl: image?.imageUrl ?? placeholder!.imageUrl,
        thumbnailUrl: image?.thumbnailUrl ?? placeholder!.thumbnailUrl,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })
    insertedCount++

    if (spec.slots.length > 0) {
      const occurrences: { date: string; startTime: string; endTime: string; note: null }[] = []
      for (const slot of spec.slots) {
        const cursor = new Date(`${toDateString(today)}T00:00:00Z`)
        const end = new Date(`${toDateString(addWeeks(today, ONGOING_WINDOW_WEEKS))}T00:00:00Z`)
        while (cursor <= end) {
          if (cursor.getUTCDay() === slot.day) {
            occurrences.push({ date: toDateString(cursor), startTime: slot.start, endTime: slot.end, note: null })
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        }
      }
      if (occurrences.length > 0) {
        await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
        occurrenceCount += occurrences.length
      }
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-20-rebuild-little-gym',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Replaced one generic listing with 11 real per-class-level listings' },
  })

  console.log(`Inserted ${insertedCount} listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
