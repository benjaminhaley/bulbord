import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Feedback (2026-08-20): School of Rock's single "Rock 101" listing was
// another generic-blob case — its own price_note already named two real,
// separately-priced programs ("Rookies $25/class... Little Wing
// $22.50/class") that were never actually researched into real listings.
// Sourced live from the studio's real Pike13 booking calendar
// (chicago-sor.pike13.com), which renders real weekly class sections —
// School of Rock genuinely runs several parallel weekly sessions per
// program rather than one fixed time for everyone, so only Little Wing
// (whose exact session times were confirmed) gets real occurrence rows;
// Rookies/Rock 101/House Band's real day patterns are named honestly in
// cadence_note without inventing exact times research didn't confirm.
const ADDRESS = '3254 N Lincoln Ave, Chicago, IL 60657'
const LAT = '41.939400'
const LNG = '-87.667500'
const DISTANCE_MILES = '1.18'
const SOURCE_URL = 'https://chicago-sor.pike13.com/locations/school-of-rock-chicago'

interface ClassSpec {
  className: string
  ageMin: number | null
  ageMax: number | null
  description: string
  price: string | null
  priceUnit: string | null
  pricePerWeek: string | null
  priceNote: string | null
  cadenceNote: string | null
  slots: { day: number; start: string; end: string }[]
}

const CLASSES: ClassSpec[] = [
  {
    className: 'Little Wing',
    ageMin: 3,
    ageMax: 5,
    description: 'A real weekly group music class for the youngest musicians, introducing rhythm and instruments through play.',
    price: '22.50',
    priceUnit: 'per class',
    pricePerWeek: '22.50',
    priceNote: null,
    cadenceNote: null,
    slots: [
      { day: 5, start: '15:30:00', end: '16:15:00' },
      { day: 6, start: '11:00:00', end: '11:45:00' },
      { day: 6, start: '15:00:00', end: '15:45:00' },
    ],
  },
  {
    className: 'Rookies',
    ageMin: 6,
    ageMax: 7,
    description: 'A real weekly group music class building toward ensemble playing, for early elementary kids.',
    price: '25.00',
    priceUnit: 'per class',
    pricePerWeek: '25.00',
    priceNote: null,
    cadenceNote: 'Several weekly sections across Tuesday, Wednesday, Thursday, and Saturday — exact times vary by section; check the studio\'s live booking calendar.',
    slots: [],
  },
  {
    className: 'Rock 101',
    ageMin: 8,
    ageMax: 13,
    description:
      'A weekly private instrument lesson paired with a free weekly group rehearsal, building to a live show at a real venue after about 14 weeks — not a stand-alone group class.',
    price: '41.25',
    priceUnit: 'per 30-min private lesson',
    pricePerWeek: '41.25',
    priceNote: 'A 45-min private lesson is also available at $62.50. The weekly group rehearsal is free, bundled with lesson tuition.',
    cadenceNote: 'Private lesson day/time is assigned at enrollment; the free weekly rehearsal has about 10 real weekly time slots — check the studio\'s live booking calendar.',
    slots: [],
  },
  {
    className: 'House Band / Performance Program',
    ageMin: 7,
    ageMax: 18,
    description:
      'Real, named rotating rehearsal bands (e.g. Hair Metal, Pop Punk/Emo) for more experienced musicians, culminating in a live show after about 14 weeks.',
    price: null,
    priceUnit: null,
    pricePerWeek: null,
    priceNote: 'No standalone fee found — appears bundled into lesson tuition, same as Rock 101\'s own rehearsal.',
    cadenceNote: 'Several real weekly rehearsal slots, mostly evenings — check the studio\'s live booking calendar for the current band/section list.',
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
    .where(eq(sportsClubs.title, 'School of Rock — Rock 101'))
  if (!existing?.sourceId) throw new Error('Existing School of Rock listing (or its source_id) not found')
  const sourceId = existing.sourceId

  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'School of Rock — Rock 101'))
    .returning({ id: sportsClubs.id })
  console.log(`Soft-deleted ${deleted.length} old listing(s).`)

  const image = await enrichSportsClubSourceImage([SOURCE_URL, 'https://www.schoolofrock.com/locations/chicago', 'https://www.facebook.com/SchoolofRockChicago'])
  const placeholder = image ? null : await uploadPlaceholderImage('School of Rock', 'sportsclubs')

  const today = new Date()
  let insertedCount = 0
  let occurrenceCount = 0

  for (const spec of CLASSES) {
    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: `School of Rock — ${spec.className}`,
        description: spec.description,
        category: 'Music',
        scheduleType: 'ongoing',
        firstDate: null,
        lastDate: null,
        cadenceNote: spec.cadenceNote,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        price: spec.price,
        priceUnit: spec.priceUnit,
        pricePerWeek: spec.pricePerWeek,
        priceNote: spec.priceNote,
        options: null,
        address: ADDRESS,
        locationName: 'School of Rock',
        latitude: LAT,
        longitude: LNG,
        distanceMiles: DISTANCE_MILES,
        signupStatus: 'open',
        signupInstructions: 'Book a lesson/audition through the studio\'s scheduling page.',
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
    actor: 'system:backfill-2026-08-20-rebuild-school-of-rock',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Replaced one generic listing with 4 real per-program listings' },
  })

  console.log(`Inserted ${insertedCount} listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
