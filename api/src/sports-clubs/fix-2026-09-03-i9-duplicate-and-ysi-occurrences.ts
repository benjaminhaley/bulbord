import 'dotenv/config'
import { db } from '../db/client.js'
import { sportsClubs, sportsClubSources, sportsClubOccurrences, eventsLog } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const DUPLICATE_LISTING_ID = '19e2074b-8dd3-4239-852f-9571c01aa996' // "i9 Sports Flag Football" — accidental dupe
const DUPLICATE_SOURCE_ID = '80e53cd3-6040-4458-aa89-f20dab0c2b89' // "i9 Sports — Chicago Northside" — accidental dupe

const YSI_PLAYMAKERS_ID = '1a736988-f292-493a-9800-f81b7cf341df'
const YSI_FIRST_TOUCH_ID = 'b2015937-6994-46da-96e5-18799c111e69'

// Estimated season end — typical Chicago outdoor youth rec-soccer fall
// season length (~11 weeks from late Aug), no real published end date found
// (see backfill-2026-09-03-more-providers.ts's own header note). Labeled
// "(estimated)" in cadenceNote, matching this app's own price_is_estimated
// convention for a genuinely uncertain fact rather than a silently-guessed
// one.
const ESTIMATED_SEASON_END = '2026-11-14'

async function main() {
  // 1. Soft-delete the accidental i9 Sports duplicate (a real "i9 Sports —
  // Flag Football" already existed from the 2026-08-18/19 sports-clubs
  // launch pass, which this session didn't check for before re-researching
  // the same real program).
  await db.delete(sportsClubOccurrences).where(eq(sportsClubOccurrences.sportsClubId, DUPLICATE_LISTING_ID))
  await db.update(sportsClubs).set({ deletedAt: new Date() }).where(eq(sportsClubs.id, DUPLICATE_LISTING_ID))
  await db.update(sportsClubSources).set({ deletedAt: new Date() }).where(eq(sportsClubSources.id, DUPLICATE_SOURCE_ID))
  console.log('Soft-deleted duplicate i9 Sports listing and source.')

  // 2. Give the two real YSI listings actual occurrence rows so they're not
  // silently excluded from GET /sports-clubs (which requires at least one
  // upcoming occurrence — see sports-clubs/sorting.ts). Playmakers: real
  // confirmed days (Tue/Sat for most age groups) from firstDate through the
  // estimated season end. First Touch: real confirmed Saturdays-only, same
  // estimated end.
  await db.update(sportsClubs).set({ lastDate: ESTIMATED_SEASON_END, cadenceNote: 'Fall 2026 season — classes started the week of Aug 25, 2026, twice weekly (Tue/Sat or Thu/Sat depending on age group), estimated to run through mid-November 2026 (exact end date not independently published — contact YSIFC for the confirmed schedule).' }).where(eq(sportsClubs.id, YSI_PLAYMAKERS_ID))
  await db.update(sportsClubs).set({ lastDate: ESTIMATED_SEASON_END, cadenceNote: 'Fall 2026 season, Saturday mornings at Hawthorne, estimated to run through mid-November 2026 (exact end date not independently published). Both Hawthorne sessions are currently sold out for Fall 2026 — check back for the next season or ask about their waitlist.' }).where(eq(sportsClubs.id, YSI_FIRST_TOUCH_ID))

  function weeklyDates(startDate: string, endDate: string, daysOfWeek: number[]): string[] {
    const dates: string[] = []
    const cursor = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    while (cursor <= end) {
      if (daysOfWeek.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  // Playmakers: Tuesdays (2) & Saturdays (6) — real confirmed days across
  // all three Hawthorne age groups (exact hour varies by group and wasn't
  // published, so startTime/endTime stay null, same "unknown, not
  // fabricated" posture as every other honesty gap in this pass).
  const playmakersDates = weeklyDates('2026-08-25', ESTIMATED_SEASON_END, [2, 6])
  await db.insert(sportsClubOccurrences).values(
    playmakersDates.map((date) => ({ sportsClubId: YSI_PLAYMAKERS_ID, date, startTime: null, endTime: null, note: null })),
  )

  // First Touch: Saturdays only, with the two real confirmed times.
  const firstTouchDates = weeklyDates('2026-08-29', ESTIMATED_SEASON_END, [6])
  await db.insert(sportsClubOccurrences).values(
    firstTouchDates.map((date) => ({ sportsClubId: YSI_FIRST_TOUCH_ID, date, startTime: '09:00', endTime: '11:00', note: null })),
  )

  console.log(`Playmakers: ${playmakersDates.length} occurrence rows. First Touch: ${firstTouchDates.length} occurrence rows.`)

  await db.insert(eventsLog).values({
    actor: 'claude:fix-2026-09-03-sports-clubs-duplicate-and-occurrences',
    action: 'sports_clubs_seeded',
    metadata: { reason: 'Removed accidental i9 Sports duplicate; added missing YSI occurrence rows so both listings are visible' },
  })
}
await main()
process.exit(0)
