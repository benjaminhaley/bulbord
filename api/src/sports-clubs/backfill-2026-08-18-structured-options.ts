import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { sportsClubs, type SportsClubOptionLine } from '../db/schema.js'

// Feedback (2026-08-18, from a live screenshot of Uniting Voices Chicago's
// detail page): three real tiers (Allegro/Vivace/Presto), each with its own
// meeting time, had been crammed into one cadence_note sentence — "Allegro
// 4:45-5:45pm, Vivace 5:45-6:45pm, Presto 6:45-7:45pm" — and read as a wall
// of text. Same lesson Camps already learned the hard way with
// CampOptionLine: a genuinely multi-tier fact belongs in a real structured
// table, not prose. This backfill updates every existing listing that has
// the same shape (found by re-reading every seeded listing's cadence_note
// with that lesson in mind, not just the one Ben flagged) — hand-typed from
// the same real research already in seed-2026-08-18-providers.ts, not
// derived by parsing the old text, same "fix the seed source AND backfill
// existing rows" split Camps' own structured-options backfill used.
//
// Per-tier age_min/age_max are left null where the real research never
// established which specific age range maps to which named tier (Uniting
// Voices' three levels, Kidcreate is the one exception where the tiers
// *are* named by age already) — never fabricated to fill the column.

interface OptionsUpdate {
  title: string
  options: SportsClubOptionLine[]
  cadenceNote: string | null
  priceNote?: string | null
}

const OPTIONS_UPDATES: OptionsUpdate[] = [
  {
    title: 'Uniting Voices Chicago — Lincoln Park Neighborhood Choir',
    options: [
      { label: 'Allegro', start_time: '16:45', end_time: '17:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Vivace', start_time: '17:45', end_time: '18:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Presto', start_time: '18:45', end_time: '19:45', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    ],
    cadenceNote: 'Meets Tuesdays and Thursdays; level assigned by age/experience.',
  },
  {
    title: 'Kidcreate Studio — Art Academy',
    options: [
      { label: 'Art 1 · Explore', start_time: null, end_time: null, price: null, price_unit: null, age_min: 4, age_max: 6, note: null },
      { label: 'Art 2 · Build', start_time: null, end_time: null, price: null, price_unit: null, age_min: 7, age_max: 9, note: null },
      { label: 'Art 3 · Create', start_time: null, end_time: null, price: null, price_unit: null, age_min: 10, age_max: 12, note: null },
    ],
    cadenceNote: 'Rolling monthly enrollment — exact weekly day/time assigned when you join.',
  },
  {
    title: 'Unicoi Art Studio — Weekly Art Classes',
    options: [
      { label: 'Happy Hands', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 3, age_max: 5, note: null },
      { label: 'Art Inspired by Artists', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 4, age_max: 10, note: null },
      { label: 'Mixed Media', start_time: null, end_time: null, price: '25.00', price_unit: 'per class', age_min: 6, age_max: 12, note: null },
      { label: 'Sketch and Paint', start_time: null, end_time: null, price: '30.00', price_unit: 'per class', age_min: 5, age_max: 12, note: null },
      { label: 'Duct Tape Products', start_time: null, end_time: null, price: '30.00', price_unit: 'per class', age_min: 7, age_max: 15, note: null },
    ],
    cadenceNote: 'Exact weekly day/time varies by class.',
    priceNote: null, // now redundant — each class's own price shows in the table
  },
  {
    title: 'Thousand Waves — Kids Karate (Seido)',
    options: [
      { label: 'Juniors (age 5 – 2nd grade)', start_time: '16:15', end_time: '17:00', price: null, price_unit: null, age_min: 5, age_max: 7, note: null },
      { label: 'Youth & Teens (3rd grade – 14)', start_time: '17:00', end_time: '18:00', price: null, price_unit: null, age_min: 8, age_max: 14, note: null },
    ],
    cadenceNote: 'Sample Tuesday schedule shown — full weekly schedule at the studio\'s own site.',
  },
  {
    title: 'Japan Karate Association of Chicago — Kids Karate',
    options: [
      { label: 'Beginner (Mon & Wed)', start_time: '17:00', end_time: '17:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Mon & Wed)', start_time: '17:30', end_time: '18:30', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Tue)', start_time: '12:00', end_time: '13:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
      { label: 'Intermediate/Advanced (Sat)', start_time: '09:00', end_time: '10:00', price: null, price_unit: null, age_min: null, age_max: null, note: null },
    ],
    cadenceNote: null,
  },
  {
    title: 'Supreme Jiu Jitsu — Bully Proof Kids BJJ',
    options: [
      { label: 'Little Kids', start_time: null, end_time: null, price: null, price_unit: null, age_min: 4, age_max: 7, note: 'Tue & Thu 5pm, Sat 9am' },
      { label: 'Big Kids', start_time: null, end_time: null, price: null, price_unit: null, age_min: 8, age_max: null, note: 'Tue 5pm, Thu 5:50pm, Sat 9:50am' },
    ],
    cadenceNote: null,
  },
]

// Lighter cosmetic trims — no real structural change, just dropping a
// redundant restatement of the date range already shown in the badge line
// above, a leftover research-process phrase ("as published on..."), or a
// no-class exception that's already reflected for real in the generated
// occurrence list below it, so restating it a second time added nothing.
const CADENCE_NOTE_TRIMS: Record<string, string> = {
  'Dance on Broadway — Youth Program': 'Exact weekly class day/time varies by level — see the studio for the full schedule.',
  'A Fairytale Ballet — Academy Program': 'Exact weekly class day/time not published.',
  'The Music Playhouse — The Music Class': '45-minute class. Exact weekly day/time not published online.',
  'Lil Sluggers Chicago — Lil League (T-Ball & Coach-Pitch)': 'Plus a Saturday game. Exact weekday not published.',
  'Kids Clay Room — Handbuilding': 'Mondays, 4:30-5:45pm. One make-up class permitted per session; finished pieces ready about 3 weeks after the last class.',
  'Tutu School — Ballet Classes': 'A specific class time is scheduled within the studio\'s weekly operating hours — enrollment is always open.',
}

async function main() {
  for (const update of OPTIONS_UPDATES) {
    const values: Partial<typeof sportsClubs.$inferInsert> = { options: update.options, cadenceNote: update.cadenceNote }
    if ('priceNote' in update) values.priceNote = update.priceNote
    const result = await db.update(sportsClubs).set(values).where(eq(sportsClubs.title, update.title)).returning({ id: sportsClubs.id })
    console.log(`${update.title}: ${result.length} row(s) updated with structured options`)
  }

  for (const [title, cadenceNote] of Object.entries(CADENCE_NOTE_TRIMS)) {
    const result = await db.update(sportsClubs).set({ cadenceNote }).where(eq(sportsClubs.title, title)).returning({ id: sportsClubs.id })
    console.log(`${title}: ${result.length} row(s) trimmed`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
