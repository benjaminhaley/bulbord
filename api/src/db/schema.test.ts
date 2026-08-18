import { describe, expect, it } from 'vitest'

import { camps, events, sportsClubs } from './schema.js'

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
