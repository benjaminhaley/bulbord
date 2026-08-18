import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { sportsClubs } from '../db/schema.js'

// Feedback (2026-08-18): "can you standardize price as a weekly number?" —
// hand-computed from each listing's real price/priceUnit (already in the
// database) using its own known cadence: a real occurrence count for a
// fixed session (Kids Clay Room, the three Chicago Park District listings),
// or a 52/12 weeks-per-month average for an ongoing monthly rate (Tutu
// School, Thousand Waves, The Little Gym) — same values as
// seed-2026-08-18-providers.ts's LISTINGS array, hand-copied here rather
// than derived by parsing anything, same "fix the seed source AND backfill
// existing rows" split Camps' own structured-options backfill used. A
// listing with no real single price (null, or a sliding-scale range) has no
// row here — never fabricated from nothing.

const PRICE_PER_WEEK_UPDATES: Record<string, number> = {
  'Tutu School': 25.85, // $112/mo * 12/52
  'Old Town School — Wiggleworms': 27.63, // $221 / 8-week session
  'The Music Playhouse — The Music Class': 25.0, // $250 / 10-week semester
  'School of Rock — Rock 101': 41.25, // one weekly private lesson
  'Kids Clay Room — Handbuilding': 44.17, // $265 / 6 real Monday classes
  'Kids Clay Room — Wheelthrowing': 45.83, // $275 / 6 real Wednesday classes
  'Unicoi Art Studio': 25.0, // one class/week at the most common rate
  'Chicago Park District — T-ball': 1.25, // $10 / 8-week historical season
  'Chicago Park District — Basketball': 1.07, // $15 / 14 real Thursdays
  'Chicago Park District — Soccer': 1.43, // $20 / 14 real Thursdays
  'Chicago Park District — Boys Gymnastics Level 1': 8.07, // $113 / 14 real Tuesdays
  'Thousand Waves — Kids Karate (Seido)': 28.85, // $125/mo * 12/52
  'The Little Gym of Chicago': 36.92, // $160/mo * 12/52
}

async function main() {
  for (const [title, pricePerWeek] of Object.entries(PRICE_PER_WEEK_UPDATES)) {
    const result = await db
      .update(sportsClubs)
      .set({ pricePerWeek: pricePerWeek.toFixed(2) })
      .where(eq(sportsClubs.title, title))
      .returning({ id: sportsClubs.id })
    console.log(`${title}: ${result.length} row(s) updated`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
