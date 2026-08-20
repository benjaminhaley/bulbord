import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources } from '../db/schema.js'

// Feedback (2026-08-20): "A Fairytale Ballet clearly has multiple specific
// classes... hold yourself to a higher standard like you did for Dance on
// Broadway." The single generic listing (age_min:5, age_max:17 — an
// average that actually excluded the studio's entire Fairytale division
// for kids under 5) collapsed 5 real, separately-scheduled class types
// into one vague row, the exact same under-researched-blob failure Dance
// on Broadway and Tutu School had.
//
// Sourced live from lakeview.afairytaleballet.com's real Fall 2026
// schedule pages (both the Fairytale division's own fairytale-fall-26/
// page and the Academy division's academy-fall-2026/ page), and one real
// enrollment product page (verified with a real headless-browser render,
// including selecting both dropdowns, since a plain fetch showed nothing)
// to confirm pricing is genuinely unpublished — not a fetch failure. The
// two divisions run on genuinely different real term dates (Fairytale:
// Aug 17–Nov 29, 2026; Academy: Aug 17–Jan 17, 2027), reflected per class
// below rather than one blanket date range.
//
// Price stays null/"not published" for every class — confirmed via a real
// browser render of the actual enrollment form (both class and day/time
// selected) with no price ever appearing, the same honest conclusion the
// original single-row research already reached, just re-verified more
// rigorously rather than assumed unchanged.

const ADDRESS = '3234 N Southport Ave, Chicago, IL 60657'
const LAT = 41.9414
const LNG = -87.6641
const DISTANCE_MILES = '1.00'
const FAIRYTALE_SOURCE_URL = 'https://lakeview.afairytaleballet.com/fairytale-fall-26/'
const ACADEMY_SOURCE_URL = 'https://lakeview.afairytaleballet.com/academy-fall-2026/'
const FAIRYTALE_START = '2026-08-17'
const FAIRYTALE_END = '2026-11-29'
const ACADEMY_START = '2026-08-17'
const ACADEMY_END = '2027-01-17'
const REAL_IMAGE_URL = '/uploads/sportsclubs/e406c243-4d8a-418a-b496-d45b55ec3da5.jpeg'
const REAL_THUMBNAIL_URL = '/uploads/sportsclubs/e406c243-4d8a-418a-b496-d45b55ec3da5-thumb.jpg'

interface Slot {
  day: number // JS getDay(): 0=Sun..6=Sat
  time: string
  durationMin: number
}

interface ClassSpec {
  className: string
  ageMin: number
  ageMax: number
  description: string
  sourceUrl: string
  firstDate: string
  lastDate: string
  slots: Slot[]
}

const CLASSES: ClassSpec[] = [
  {
    className: 'Baby Ballerinas',
    ageMin: 1,
    ageMax: 2,
    description:
      'Our Pre-Fairytale Ballet Class, featuring engaging nursery rhymes and creative props, for dancers 18–24 months old with a caregiver.',
    sourceUrl: FAIRYTALE_SOURCE_URL,
    firstDate: FAIRYTALE_START,
    lastDate: FAIRYTALE_END,
    slots: [
      { day: 1, time: '09:30:00', durationMin: 30 },
      { day: 5, time: '09:00:00', durationMin: 30 },
      { day: 6, time: '09:15:00', durationMin: 30 },
    ],
  },
  {
    className: 'Twinkle Toes',
    ageMin: 2,
    ageMax: 3,
    description: 'A magical Fairytale Ballet class full of imagery, fun, and movement, for dancers ages 2–3.',
    sourceUrl: FAIRYTALE_SOURCE_URL,
    firstDate: FAIRYTALE_START,
    lastDate: FAIRYTALE_END,
    slots: [
      { day: 1, time: '11:00:00', durationMin: 30 },
      { day: 2, time: '09:30:00', durationMin: 30 },
      { day: 4, time: '09:30:00', durationMin: 30 },
      { day: 4, time: '16:00:00', durationMin: 30 },
      { day: 5, time: '09:30:00', durationMin: 30 },
      { day: 6, time: '09:00:00', durationMin: 30 },
      { day: 0, time: '09:15:00', durationMin: 30 },
    ],
  },
  {
    className: 'Fairytale Ballerinas',
    ageMin: 2,
    ageMax: 3,
    description: 'Combines weekly Fairytale Ballets with a progressing curriculum, for dancers ages 2.5–3.5.',
    sourceUrl: FAIRYTALE_SOURCE_URL,
    firstDate: FAIRYTALE_START,
    lastDate: FAIRYTALE_END,
    slots: [
      { day: 2, time: '11:00:00', durationMin: 35 },
      { day: 4, time: '11:00:00', durationMin: 35 },
      { day: 5, time: '11:00:00', durationMin: 35 },
      { day: 6, time: '09:30:00', durationMin: 35 },
      { day: 0, time: '09:25:00', durationMin: 35 },
    ],
  },
  {
    className: 'Fairytale Ballerinas with Tap',
    ageMin: 3,
    ageMax: 5,
    description:
      'Combines the Fairytale Ballet curriculum with introductory tap technique, for dancers ages 3–5.',
    sourceUrl: FAIRYTALE_SOURCE_URL,
    firstDate: FAIRYTALE_START,
    lastDate: FAIRYTALE_END,
    slots: [
      { day: 1, time: '10:00:00', durationMin: 45 },
      { day: 1, time: '13:00:00', durationMin: 45 },
      { day: 1, time: '15:30:00', durationMin: 45 },
      { day: 1, time: '16:30:00', durationMin: 45 },
      { day: 2, time: '10:00:00', durationMin: 45 },
      { day: 2, time: '12:00:00', durationMin: 45 },
      { day: 3, time: '17:30:00', durationMin: 45 },
      { day: 4, time: '10:00:00', durationMin: 45 },
      { day: 4, time: '13:15:00', durationMin: 45 },
      { day: 4, time: '16:30:00', durationMin: 45 },
      { day: 5, time: '10:00:00', durationMin: 45 },
      { day: 6, time: '09:45:00', durationMin: 45 },
      { day: 6, time: '10:15:00', durationMin: 45 },
      { day: 6, time: '11:15:00', durationMin: 45 },
      { day: 0, time: '09:45:00', durationMin: 45 },
      { day: 0, time: '10:00:00', durationMin: 45 },
      { day: 0, time: '11:00:00', durationMin: 45 },
      { day: 0, time: '13:00:00', durationMin: 45 },
    ],
  },
  {
    className: 'Academy Pre-Ballet',
    ageMin: 5,
    ageMax: 7,
    description:
      'Transitions dancers from the Fairytale program into the Academy program, gradually incorporating classical ballet technique and traditional barre work, for dancers in K–1st grade.',
    sourceUrl: ACADEMY_SOURCE_URL,
    firstDate: ACADEMY_START,
    lastDate: ACADEMY_END,
    slots: [
      { day: 1, time: '17:30:00', durationMin: 60 },
      { day: 3, time: '16:15:00', durationMin: 60 },
      { day: 4, time: '17:30:00', durationMin: 60 },
      { day: 6, time: '10:45:00', durationMin: 60 },
      { day: 0, time: '10:45:00', durationMin: 60 },
    ],
  },
]

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addMinutes(time: string, minutes: number): string {
  const [h, m, s] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface OccurrenceRow {
  date: string
  startTime: string
  endTime: string
  note: null
}

function weeklyOccurrences(firstDate: string, lastDate: string, slot: Slot): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${firstDate}T00:00:00Z`)
  const end = new Date(`${lastDate}T00:00:00Z`)
  while (cursor <= end) {
    if (cursor.getUTCDay() === slot.day) {
      rows.push({ date: toDateString(cursor), startTime: slot.time, endTime: addMinutes(slot.time, slot.durationMin), note: null })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

async function main() {
  const [source] = await db.select({ id: sportsClubSources.id }).from(sportsClubSources).where(eq(sportsClubSources.name, 'A Fairytale Ballet (Lakeview)'))
  if (!source) throw new Error('A Fairytale Ballet source row not found')

  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'A Fairytale Ballet'))
    .returning({ id: sportsClubs.id })
  console.log(`Soft-deleted ${deleted.length} old listing(s).`)

  let insertedCount = 0
  let occurrenceCount = 0

  for (const spec of CLASSES) {
    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: `A Fairytale Ballet — ${spec.className}`,
        description: spec.description,
        category: 'Dance',
        scheduleType: 'fixed_session',
        firstDate: spec.firstDate,
        lastDate: spec.lastDate,
        cadenceNote: null,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        price: null,
        priceUnit: null,
        pricePerWeek: null,
        priceNote: 'Tuition not published online, even through the real enrollment form — call the studio for pricing.',
        options: null,
        address: ADDRESS,
        locationName: 'A Fairytale Ballet',
        latitude: LAT.toString(),
        longitude: LNG.toString(),
        distanceMiles: DISTANCE_MILES,
        signupStatus: 'open',
        signupInstructions: 'Enroll online — the site invites "Enroll & Start FALL today!"',
        sourceUrl: spec.sourceUrl,
        sourceId: source.id,
        imageUrl: REAL_IMAGE_URL,
        thumbnailUrl: REAL_THUMBNAIL_URL,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })
    insertedCount++

    const occurrences = spec.slots.flatMap((slot) => weeklyOccurrences(spec.firstDate, spec.lastDate, slot))
    if (occurrences.length > 0) {
      await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
      occurrenceCount += occurrences.length
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-20-rebuild-fairytale-ballet',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Replaced one generic listing with 5 real per-class listings from the real Fall 2026 schedule pages' },
  })

  console.log(`Inserted ${insertedCount} listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
