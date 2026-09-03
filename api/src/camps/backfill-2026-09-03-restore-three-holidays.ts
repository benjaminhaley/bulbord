import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, schoolBreaks } from '../db/schema.js'

// Confirmed with Ben (2026-09-03, feedback #130): the paid-holiday exclusion
// from seed-2026-08-04-school-breaks.ts is narrowed to just six "core"
// holidays — New Year's Day, Memorial Day, Independence Day, Labor Day,
// Thanksgiving, Christmas (the last two already covered by the Thanksgiving
// Break / Winter Break rows, and New Year's Day / Independence Day already
// fall inside Winter Break / Summer Break respectively — none of those four
// need a new row). Indigenous Peoples' Day, MLK Jr. Day, and Presidents' Day
// are no longer excluded — they come back in as ordinary single-day
// school_breaks rows, same shape as the Professional Development days.
// Dates from the same real 2026-27 CPS family calendar image already used
// to source the original seed (each confirmed as "*" = Holiday, non-
// attendance day, in the calendar Ben posted with feedback #130).
const breaks: (typeof schoolBreaks.$inferInsert)[] = [
  {
    name: "Indigenous Peoples' Day",
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    splitWeekly: false,
    notes:
      'No school for students (paid holiday, no longer excluded as of feedback #130, 2026-09-03 — see CLAUDE.md). CPS 2026-27 calendar.',
  },
  {
    name: 'MLK Jr. Day',
    startDate: '2027-01-18',
    endDate: '2027-01-18',
    splitWeekly: false,
    notes:
      'No school for students (paid holiday, no longer excluded as of feedback #130, 2026-09-03 — see CLAUDE.md). CPS 2026-27 calendar.',
  },
  {
    name: "Presidents' Day",
    startDate: '2027-02-15',
    endDate: '2027-02-15',
    splitWeekly: false,
    notes:
      'No school for students (paid holiday, no longer excluded as of feedback #130, 2026-09-03 — see CLAUDE.md). CPS 2026-27 calendar.',
  },
]

async function main() {
  const inserted = await db.insert(schoolBreaks).values(breaks).returning({ id: schoolBreaks.id, name: schoolBreaks.name })

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-09-03-restore-three-holidays',
    action: 'school_breaks_seeded',
    metadata: { count: inserted.length, reason: 'feedback #130' },
  })

  console.log(`Inserted ${inserted.length} school breaks:`, inserted)
}

await main()
process.exit(0)
