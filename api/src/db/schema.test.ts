import { describe, expect, it } from 'vitest'

import { camps, events, sportsClubOccurrences, sportsClubs } from './schema.js'

// Guards the actual guarantee behind "you're not allowed to create a camp or
// event without an image" (feedback, 2026-08-14) — a real Postgres NOT NULL
// constraint on these four columns, restored after a real event shipped
// with no image at all (see CLAUDE.md's Images & object storage section).
// This can't verify the live database's constraint directly (these tests
// never touch a real database — see every other *.test.ts in this repo),
// but it does verify the schema *declares* NOT NULL, which is what
// `drizzle-kit generate` reads to produce the migration in the first place —
// so a future accidental revert of schema.ts (a bad merge, a
// "simplification" that drops `.notNull()`) fails this test immediately,
// well before it could ever reach a migration or production.
describe('events/camps image columns stay NOT NULL', () => {
  it('events.imageUrl/thumbnailUrl are NOT NULL', () => {
    expect(events.imageUrl.notNull).toBe(true)
    expect(events.thumbnailUrl.notNull).toBe(true)
  })

  it('camps.imageUrl/thumbnailUrl are NOT NULL', () => {
    expect(camps.imageUrl.notNull).toBe(true)
    expect(camps.thumbnailUrl.notNull).toBe(true)
  })

  it('sportsClubs.imageUrl/thumbnailUrl are NOT NULL', () => {
    expect(sportsClubs.imageUrl.notNull).toBe(true)
    expect(sportsClubs.thumbnailUrl.notNull).toBe(true)
  })
})

// The database stores every point in time as a real UTC instant with time
// zone (timestamptz) — 2026-09-20, after timezone-less date/time columns made
// a subscribed calendar show events hours off. start_date/start_time/... on
// these tables are GENERATED (derived) columns and must never be written.
describe('point-in-time columns are timestamptz, with derived wall-clock views', () => {
  it('events.startsAt/endsAt are timestamptz, startsAt NOT NULL', () => {
    expect(events.startsAt.columnType).toBe('PgTimestamp')
    expect(events.startsAt.notNull).toBe(true)
    expect(events.endsAt.columnType).toBe('PgTimestamp')
    expect((events.startsAt as unknown as { withTimezone: boolean }).withTimezone).toBe(true)
    expect((events.endsAt as unknown as { withTimezone: boolean }).withTimezone).toBe(true)
  })

  it('sportsClubOccurrences.startsAt/endsAt are timestamptz', () => {
    expect((sportsClubOccurrences.startsAt as unknown as { withTimezone: boolean }).withTimezone).toBe(true)
    expect((sportsClubOccurrences.endsAt as unknown as { withTimezone: boolean }).withTimezone).toBe(true)
    expect(sportsClubOccurrences.startsAt.notNull).toBe(true)
  })

  it('the old date/time columns are generated, not writable', () => {
    for (const col of [events.startDate, events.startTime, events.endTime, sportsClubOccurrences.date, sportsClubOccurrences.startTime, sportsClubOccurrences.endTime]) {
      expect(col.generated?.type).toBe('always')
    }
  })

  it('camps carry an explicit time zone for their daily hours', () => {
    expect(camps.timeZone.notNull).toBe(true)
  })
})
