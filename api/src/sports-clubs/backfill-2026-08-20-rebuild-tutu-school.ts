import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Feedback (2026-08-20), from a real screenshot of tutuschool.com/roscoe/
// classes: the single generic "Tutu School" listing ("a specific class
// time is scheduled within the studio's weekly operating hours") was the
// same under-researched-blob failure mode Dance on Broadway had before its
// rebuild — the real page has a genuinely rich, fully public weekly
// schedule (8 distinct class types across all 7 days, 43 real weekly
// sessions total), not just one nebulous "always open" story. "Look more
// carefully at each of the listings and make sure you identify the
// specific classes... hold yourself to a higher standard like you did for
// Dance on Broadway."
//
// Sourcing method: the schedule page is genuinely server-rendered HTML
// (not JS-rendered), so it was parsed directly from real DOM structure
// (each class is a `.schedule-card` div with a real `<h4>` name/`<p>`
// age/`<p>` time) rather than trusted from an AI-summarized text dump —
// same "verify against real structure, don't trust a one-shot summary"
// rigor the Dance on Broadway PDF-grid incident established. The initial
// AI-fetched summary was independently cross-checked against a direct
// regex parse of the raw HTML and matched exactly (43/43 sessions), so no
// misattribution was found this time — but it was checked, not assumed.
//
// Grouped by the studio's own 8 real class names (not by every individual
// weekly time slot — a genuinely different unit than Dance on Broadway's
// per-style split, since here every session of "Exploring Ballet A/B" is
// the identical class/curriculum offered at many times for scheduling
// convenience, not a different style/content the way Dance on Broadway's
// per-day sections were). Each class keeps every one of its real weekly
// occurrences.
//
// Class-level descriptions and the "Storybook Adventures in Ballet"
// curriculum philosophy are the studio's own real text
// (tutuschool.com/roscoe/), not invented — "Test Ballet Class" has no
// public description anywhere on the site, so its description says so
// honestly rather than fabricating one.
//
// Price: the $112/mo standing membership rate (already confirmed real in
// the original single-row pass) applies studio-wide across every class —
// unchanged, just now applied per real class row instead of once.

const ADDRESS = '2223 W Roscoe St, Chicago, IL 60618'
const LAT = 41.9436
const LNG = -87.6789
const SOURCE_URL = 'https://tutuschool.com/roscoe/classes/'
const PRICE = '112.00'
const PRICE_PER_WEEK = (112 * 12) / 52 // matches the original row's own $25.85/wk figure

const DISTANCE_MILES = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, LAT, LNG)

const CURRICULUM =
  '"Storybook Adventures in Ballet" — Tutu School\'s curriculum uses classical ballet stories to develop young bodies and imaginations, emphasizing "kindness wins, love is celebrated, and courage."'

interface Slot {
  day: number // JS getDay(): 0=Sun..6=Sat
  start: string
  end: string
}

interface ClassSpec {
  className: string
  ageMin: number | null
  ageMax: number | null
  description: string
  slots: Slot[]
}

// Real data, parsed directly from the schedule page's DOM structure
// (see header comment) — every real weekly session for each class.
const CLASSES: ClassSpec[] = [
  {
    className: 'Baby Ballet A/B',
    ageMin: 0,
    ageMax: 1,
    description: `For babies 6–18 months old (pre-walkers and walkers), with caregiver participation required. ${CURRICULUM}`,
    slots: [
      { day: 5, start: '11:30:00', end: '12:15:00' },
      { day: 0, start: '08:15:00', end: '09:00:00' },
    ],
  },
  {
    className: 'Tutu Toddlers A/B',
    ageMin: 1,
    ageMax: 3,
    description: `For toddlers 18 months to 3 years old, with caregiver participation required. ${CURRICULUM}`,
    slots: [
      { day: 1, start: '09:30:00', end: '10:15:00' },
      { day: 1, start: '16:45:00', end: '17:30:00' },
      { day: 2, start: '10:00:00', end: '10:45:00' },
      { day: 2, start: '15:30:00', end: '16:15:00' },
      { day: 3, start: '10:30:00', end: '11:15:00' },
      { day: 3, start: '18:00:00', end: '18:45:00' },
      { day: 4, start: '09:30:00', end: '10:15:00' },
      { day: 5, start: '10:30:00', end: '11:15:00' },
      { day: 5, start: '16:30:00', end: '17:15:00' },
      { day: 6, start: '09:05:00', end: '09:50:00' },
      { day: 6, start: '11:00:00', end: '11:45:00' },
      { day: 0, start: '09:05:00', end: '09:50:00' },
    ],
  },
  {
    className: 'Tutu Toddlers B',
    ageMin: 2,
    ageMax: 3,
    description: `The older Tutu Toddlers band (2–3 years old), with caregiver participation required. ${CURRICULUM}`,
    slots: [{ day: 6, start: '16:00:00', end: '16:45:00' }],
  },
  {
    className: 'Exploring Ballet A/B',
    ageMin: 3,
    ageMax: 4,
    description: `For dancers ages 3–4, introducing classical ballet. ${CURRICULUM}`,
    slots: [
      { day: 1, start: '10:30:00', end: '11:15:00' },
      { day: 2, start: '09:00:00', end: '09:45:00' },
      { day: 2, start: '11:00:00', end: '11:45:00' },
      { day: 3, start: '09:30:00', end: '10:15:00' },
      { day: 4, start: '10:30:00', end: '11:15:00' },
      { day: 4, start: '16:45:00', end: '17:30:00' },
      { day: 5, start: '09:30:00', end: '10:15:00' },
      { day: 5, start: '17:30:00', end: '18:15:00' },
      { day: 6, start: '08:10:00', end: '08:55:00' },
      { day: 6, start: '10:00:00', end: '10:45:00' },
      { day: 0, start: '10:00:00', end: '10:45:00' },
    ],
  },
  {
    className: 'Exploring Ballet A/B/C',
    ageMin: 3,
    ageMax: 5,
    description: `For dancers ages 3–5, introducing classical ballet. ${CURRICULUM}`,
    slots: [
      { day: 1, start: '11:30:00', end: '12:15:00' },
      { day: 3, start: '16:00:00', end: '16:45:00' },
      { day: 6, start: '12:00:00', end: '12:45:00' },
      { day: 6, start: '15:00:00', end: '15:45:00' },
      { day: 0, start: '13:00:00', end: '13:45:00' },
    ],
  },
  {
    className: 'Exploring Ballet B/C',
    ageMin: 4,
    ageMax: 5,
    description: `For dancers ages 4–5, introducing classical ballet. ${CURRICULUM}`,
    slots: [
      { day: 1, start: '15:45:00', end: '16:30:00' },
      { day: 2, start: '17:30:00', end: '18:15:00' },
      { day: 4, start: '17:45:00', end: '18:30:00' },
      { day: 5, start: '15:30:00', end: '16:15:00' },
      { day: 6, start: '14:00:00', end: '14:45:00' },
      { day: 0, start: '11:00:00', end: '11:45:00' },
    ],
  },
  {
    className: 'Primary Ballet Prep A/B',
    ageMin: 5,
    ageMax: 8,
    description: `For dancers ages 5–8, continuing ballet technique. ${CURRICULUM}`,
    slots: [
      { day: 2, start: '16:30:00', end: '17:15:00' },
      { day: 3, start: '17:00:00', end: '17:45:00' },
      { day: 6, start: '13:00:00', end: '13:45:00' },
      { day: 0, start: '12:00:00', end: '12:45:00' },
    ],
  },
  {
    className: 'Test Ballet Class',
    ageMin: null,
    ageMax: null,
    description: 'A newly piloted class format at this studio, starting September 2026 — no public description of its curriculum or age range is published yet.',
    slots: [
      { day: 1, start: '19:00:00', end: '19:45:00' },
      { day: 2, start: '19:00:00', end: '19:45:00' },
    ],
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

interface OccurrenceRow {
  date: string
  startTime: string
  endTime: string
  note: null
}

function rollingOccurrences(today: Date, slot: Slot): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${toDateString(today)}T00:00:00Z`)
  const end = new Date(`${toDateString(addWeeks(today, ONGOING_WINDOW_WEEKS))}T00:00:00Z`)
  while (cursor <= end) {
    if (cursor.getUTCDay() === slot.day) {
      rows.push({ date: toDateString(cursor), startTime: slot.start, endTime: slot.end, note: null })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

async function main() {
  const [source] = await db.select({ id: sportsClubSources.id }).from(sportsClubSources).where(eq(sportsClubSources.name, 'Tutu School (Roscoe Village)'))
  if (!source) throw new Error('Tutu School source row not found')

  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'Tutu School'))
    .returning({ id: sportsClubs.id })
  console.log(`Soft-deleted ${deleted.length} old listing(s).`)

  const image = await enrichSportsClubSourceImage([SOURCE_URL, 'https://tutuschool.com/roscoe/', 'https://www.facebook.com/TutuSchoolChicago'])
  const placeholder = image ? null : await uploadPlaceholderImage('Tutu School', 'sportsclubs')

  const today = new Date()
  let insertedCount = 0
  let occurrenceCount = 0

  for (const spec of CLASSES) {
    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: `Tutu School — ${spec.className}`,
        description: spec.description,
        category: 'Dance',
        scheduleType: 'ongoing',
        firstDate: null,
        lastDate: null,
        cadenceNote: null,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        price: PRICE,
        priceUnit: 'per month',
        pricePerWeek: PRICE_PER_WEEK.toFixed(2),
        priceNote: null,
        options: null,
        address: ADDRESS,
        locationName: 'Tutu School',
        latitude: LAT.toString(),
        longitude: LNG.toString(),
        distanceMiles: DISTANCE_MILES.toFixed(2),
        signupStatus: 'open',
        signupInstructions: 'Registration is always ongoing — enroll anytime via the studio\'s real-time class schedule.',
        sourceUrl: SOURCE_URL,
        sourceId: source.id,
        imageUrl: image?.imageUrl ?? placeholder!.imageUrl,
        thumbnailUrl: image?.thumbnailUrl ?? placeholder!.thumbnailUrl,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })
    insertedCount++

    const occurrences = spec.slots.flatMap((slot) => rollingOccurrences(today, slot))
    if (occurrences.length > 0) {
      await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
      occurrenceCount += occurrences.length
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-20-rebuild-tutu-school',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Replaced one generic listing with 8 real per-class listings, parsed directly from the studio\'s real schedule page' },
  })

  console.log(`Inserted ${insertedCount} listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
