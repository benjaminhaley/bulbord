import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, schoolBreaks } from '../db/schema.js'

// Sourced 2026-08-04 via WebSearch/WebFetch against cps.edu and local news
// coverage of the Chicago Board of Education's approval of the 2026-27
// calendar (the original January proposal was briefly pulled and re-approved
// Feb 26, 2026 — these are the final approved dates, cross-checked across
// three independent sources):
// - https://www.wbez.org/education/2026/02/26/cps-approves-calendars-for-next-two-school-years-with-longer-summer-break-chicago-public-schools
// - https://www.wbez.org/education/2026/01/12/chicago-public-schools-releases-2026-2027-calendar-with-longer-summer-break (2025-26 last day: Jun 4, 2026)
// - https://calendars.school/il-cps-chicago-school-calendar-2026-27
// Nettelhorst, a CPS elementary school, follows the district-wide CPS
// calendar — there's no separate Nettelhorst-specific calendar for these.
//
// Includes both the four multi-day breaks AND the single-day closures
// (Labor Day, Indigenous Peoples' Day, MLK Day, Presidents' Day, Memorial
// Day, and the two parent-teacher conference days) — feedback #50's own
// example ("the Labor Day YMCA camp") is a single-day closure, not one of
// the four big breaks, so those need their own school_breaks rows too.
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
    name: 'Labor Day',
    startDate: '2026-09-07',
    endDate: '2026-09-07',
    splitWeekly: false,
    notes: 'CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: "Indigenous Peoples' Day",
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    splitWeekly: false,
    notes: 'CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Parent-Teacher Conference Day',
    startDate: '2026-11-02',
    endDate: '2026-11-02',
    splitWeekly: false,
    notes: 'No school for students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
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
    name: 'MLK Jr. Day',
    startDate: '2027-01-18',
    endDate: '2027-01-18',
    splitWeekly: false,
    notes: 'CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: "Presidents' Day",
    startDate: '2027-02-15',
    endDate: '2027-02-15',
    splitWeekly: false,
    notes: 'CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
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
    name: 'Parent-Teacher Conference Day',
    startDate: '2027-04-12',
    endDate: '2027-04-12',
    splitWeekly: false,
    notes: 'No school for students. CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
  },
  {
    name: 'Memorial Day',
    startDate: '2027-05-31',
    endDate: '2027-05-31',
    splitWeekly: false,
    notes: 'CPS 2026-27 calendar. https://calendars.school/il-cps-chicago-school-calendar-2026-27',
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
