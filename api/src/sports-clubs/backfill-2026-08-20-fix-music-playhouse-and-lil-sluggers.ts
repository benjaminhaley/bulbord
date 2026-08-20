import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs } from '../db/schema.js'

// Feedback (2026-08-20) prompted a full re-audit of every single-row
// sports-clubs listing. Unlike Dance on Broadway/Tutu School/A Fairytale
// Ballet/School of Rock/The Little Gym, these two turned out NOT to be
// hidden-multi-program cases — but the research still surfaced real,
// concrete gaps worth fixing directly rather than splitting into more
// listings:
//
// The Music Playhouse — genuinely one program ("The Music Class®") at
// Sheil Park, confirmed via the studio's real Sawyer booking widget
// (hisawyer.com/providers/the-music-playhouse-of-chicago/11875-sheil-park
// — the public-facing marketing pages never render this). It previously
// had no real day/time at all ("not published online"); it actually runs
// 3 real weekly sessions.
//
// Lil Sluggers — the existing listing was factually wrong, not just
// vague: it described "a weekly class plus a Saturday game," but the real
// registration system (tms.ezfacility.com) shows Blaine Elementary Field
// is class-only — the real Lil League games happen at entirely different
// fields (Coonley/Holstein/Churchill for T-Ball, Wrightwood/Wicker/
// Holstein for Coach-Pitch), a separate product not tied to this listing.
// Price was previously "not published" — it's now a real, confirmed $230
// for the 8-Saturday Fall 2026 session.
async function main() {
  const [musicPlayhouse] = await db
    .update(sportsClubs)
    .set({
      firstDate: '2026-09-16',
      lastDate: '2026-11-19',
      cadenceNote: null,
    })
    .where(eq(sportsClubs.title, 'The Music Playhouse — The Music Class'))
    .returning({ id: sportsClubs.id })
  if (!musicPlayhouse) throw new Error('Music Playhouse listing not found')

  const musicSlots: { day: number; start: string; end: string }[] = [
    { day: 3, start: '09:00:00', end: '09:45:00' }, // Wed
    { day: 4, start: '09:30:00', end: '10:15:00' }, // Thu
    { day: 4, start: '10:30:00', end: '11:15:00' }, // Thu
  ]
  const musicOccurrences = generateOccurrences('2026-09-16', '2026-11-19', musicSlots)
  await db.insert(sportsClubOccurrences).values(musicOccurrences.map((o) => ({ sportsClubId: musicPlayhouse.id, ...o })))

  const [lilSluggers] = await db
    .update(sportsClubs)
    .set({
      description: 'Instructional baseball class for young kids — not a league, no separate game.',
      cadenceNote: null,
      ageMin: 2,
      ageMax: 8,
      price: '230.00',
      priceUnit: 'per 8-Saturday fall session',
      pricePerWeek: (230 / 8).toFixed(2),
      priceNote: 'Registered through the studio\'s real booking system for the specific Fall 2026 session — a real confirmed one-time price, not a weekly rate. A 3% processing fee applies to card payment.',
      signupInstructions: 'Register online via the studio\'s real booking system for this location.',
    })
    .where(eq(sportsClubs.title, 'Lil Sluggers Chicago — Lil League (T-Ball & Coach-Pitch)'))
    .returning({ id: sportsClubs.id })
  if (!lilSluggers) throw new Error('Lil Sluggers listing not found')

  const sluggersSlots: { day: number; start: string; end: string }[] = [
    { day: 6, start: '09:30:00', end: '10:15:00' },
    { day: 6, start: '10:30:00', end: '11:15:00' },
    { day: 6, start: '11:30:00', end: '12:15:00' },
  ]
  const sluggersOccurrences = generateOccurrences('2026-09-05', '2026-10-24', sluggersSlots)
  await db.insert(sportsClubOccurrences).values(sluggersOccurrences.map((o) => ({ sportsClubId: lilSluggers.id, ...o })))

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-20-fix-music-playhouse-and-lil-sluggers',
    action: 'sports_club_created',
    metadata: {
      musicOccurrences: musicOccurrences.length,
      sluggersOccurrences: sluggersOccurrences.length,
      note: 'Added real confirmed schedules; corrected Lil Sluggers\' inaccurate "weekly class plus Saturday game" description and added its real confirmed price',
    },
  })

  console.log(`Music Playhouse: ${musicOccurrences.length} occurrences added. Lil Sluggers: ${sluggersOccurrences.length} occurrences added.`)
}

function generateOccurrences(
  firstDate: string,
  lastDate: string,
  slots: { day: number; start: string; end: string }[],
): { date: string; startTime: string; endTime: string; note: null }[] {
  const rows: { date: string; startTime: string; endTime: string; note: null }[] = []
  const end = new Date(`${lastDate}T00:00:00Z`)
  for (const slot of slots) {
    const cursor = new Date(`${firstDate}T00:00:00Z`)
    while (cursor <= end) {
      if (cursor.getUTCDay() === slot.day) {
        rows.push({ date: cursor.toISOString().slice(0, 10), startTime: slot.start, endTime: slot.end, note: null })
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  return rows
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
