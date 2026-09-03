import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, schoolBreaks } from '../db/schema.js'

// Sourced 2026-08-04 via WebSearch/WebFetch against cps.edu and local news
// coverage of the Chicago Board of Education's approval of the 2026-27
// calendar (the original January proposal was briefly pulled and re-approved
// Feb 26, 2026 — these are the final approved dates, cross-checked across
// independent sources):
// - https://www.wbez.org/education/2026/02/26/cps-approves-calendars-for-next-two-school-years-with-longer-summer-break-chicago-public-schools
// - https://www.wbez.org/education/2026/01/12/chicago-public-schools-releases-2026-2027-calendar-with-longer-summer-break (2025-26 last day: Jun 4, 2026)
// - https://calendars.school/il-cps-chicago-school-calendar-2026-27
// Nettelhorst, a CPS elementary school, follows the district-wide CPS
// calendar — there's no separate Nettelhorst-specific calendar for these.
//
// Includes the four multi-day breaks, the two Parent-Teacher Conference
// days, the district's General Election Day closure, AND the six
// Professional Development days (Sep 25, Nov 11, Jan 4, Jan 29, Feb 23,
// Apr 6 — teacher/staff training, no students) that a first pass of this
// seed missed (feedback: "I'm not seeing any... professional development
// days"). feedback #50's own example ("the Labor Day YMCA camp") is itself
// a single-day closure, not one of the four big breaks, so every
// non-attendance day gets its own school_breaks row, not just the major
// ones — see the exclusion note below for the one deliberate exception.
//
// Excluded on purpose (as of this original pass): the five official paid
// public holidays CPS also happens to be closed for — Labor Day, Indigenous
// Peoples' Day, MLK Jr. Day, Presidents' Day, Memorial Day (feedback,
// 2026-08-04) — since this app exists to help parents find care on days
// their KIDS are off school but THEY still have to work (see readme.md's
// "work days when kids are not in school"); on a nationally-recognized paid
// holiday most parents are off too, so there's no real camp-need to solve
// for. Election Day is kept despite CPS observing it in lieu of Veterans
// Day — it isn't a universally-recognized paid holiday for most employers
// the way the other five are, so the same reasoning doesn't apply.
//
// NARROWED 2026-09-03 (feedback #130): confirmed with Ben that the real
// exclusion list is just six "core" holidays — New Year's Day, Memorial
// Day, Independence Day, Labor Day, Thanksgiving, Christmas — not all five
// listed above. Indigenous Peoples' Day, MLK Jr. Day, and Presidents' Day
// are no longer excluded; they were added as their own school_breaks rows
// by backfill-2026-09-03-restore-three-holidays.ts rather than by editing
// the historical values below. Also excluded: the five
// staff-only PD days Aug 17-21, 2026 (before the 2026-27 school year even
// starts — already inside the seeded Summer Break range below, so a
// separate row would be redundant) and the Jun 14, 2027 PD day (after the
// 2026-27 school year ends Jun 11 — already ordinary summer for camp
// purposes, not a distinct "day off").
//
// Known gap: Summer Break 2027 (after the 2026-27 school year ends Jun 11,
// 2027) isn't seeded yet, since CPS's 2027-28 first-day date (Aug 23, 2027)
// wasn't confirmed in this pass as being final. Add it via a later
// update-*.ts once needed.
const breaks: (typeof schoolBreaks.$inferInsert)[] = [
  {
    name: 'Summer Break',
    startDate: '2026-06-05',
    endDate: '2026-08-23',
    splitWeekly: true,
    notes:
      '2025-26 CPS school year ended Jun 4, 2026; 2026-27 school year starts Aug 24, 2026. ' +
      'https://www.wbez.org/education/2026/01/12/chicago-public-schools-releases-2026-2027-calendar-with-longer-summer-break',
  },
  {
    name: 'Professional Development Day',
    startDate: '2026-09-25',
    endDate: '2026-09-25',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    // Merged into one row (feedback, 2026-08-05): Parent-Teacher Conference
    // Day (Nov 2) and Election Day (Nov 3) are consecutive dates, so they're
    // one combined non-attendance window rather than two separate one-day
    // breaks — same "overlap, don't need full coverage" logic already
    // applies to camps spanning it.
    name: 'Parent-Teacher Conference Day & Election Day',
    startDate: '2026-11-02',
    endDate: '2026-11-03',
    splitWeekly: false,
    notes:
      'Nov 2: no school for students (Parent-Teacher Conference Day). Nov 3: General (midterm) election day, observed in lieu of Veterans Day this year. Both CPS 2026-27 calendar, consecutive dates merged into one row. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Professional Development Day',
    startDate: '2026-11-11',
    endDate: '2026-11-11',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Thanksgiving Break',
    startDate: '2026-11-23',
    endDate: '2026-11-27',
    splitWeekly: false,
    notes:
      'CPS 2026-27 calendar (full week). https://www.wbez.org/education/2026/02/26/cps-approves-calendars-for-next-two-school-years-with-longer-summer-break-chicago-public-schools',
  },
  {
    name: 'Winter Break',
    startDate: '2026-12-21',
    endDate: '2027-01-01',
    splitWeekly: false,
    notes:
      'CPS 2026-27 calendar. https://www.wbez.org/education/2026/02/26/cps-approves-calendars-for-next-two-school-years-with-longer-summer-break-chicago-public-schools',
  },
  {
    name: 'Professional Development Day',
    startDate: '2027-01-04',
    endDate: '2027-01-04',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Professional Development Day',
    startDate: '2027-01-29',
    endDate: '2027-01-29',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Professional Development Day',
    startDate: '2027-02-23',
    endDate: '2027-02-23',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Spring Break',
    startDate: '2027-03-22',
    endDate: '2027-03-26',
    splitWeekly: false,
    notes:
      'CPS 2026-27 calendar (full week). https://www.wbez.org/education/2026/02/26/cps-approves-calendars-for-next-two-school-years-with-longer-summer-break-chicago-public-schools',
  },
  {
    name: 'Professional Development Day',
    startDate: '2027-04-06',
    endDate: '2027-04-06',
    splitWeekly: false,
    notes:
      'Teacher/staff training, no students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Parent-Teacher Conference Day',
    startDate: '2027-04-12',
    endDate: '2027-04-12',
    splitWeekly: false,
    notes: 'No school for students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
]

async function main() {
  const inserted = await db.insert(schoolBreaks).values(breaks).returning({ id: schoolBreaks.id })

  await db.insert(eventsLog).values({
    actor: 'system:seed-2026-08-04-school-breaks',
    action: 'school_breaks_seeded',
    metadata: { count: inserted.length },
  })

  console.log(`Seeded ${inserted.length} school breaks.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
