import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events, schoolBreaks } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Feedback #99: "make sure bike bus is on the calendar... routes shows the
// time and starting place... starts every Friday rain or shine, when school
// is on. You'll need to compare the school calendar to figure out which
// Fridays are in session." Sourced 2026-08-17 via WebFetch against
// nettelhorstbikebus.org (homepage + /route) — a real, live community
// program, not a one-off: a group bike ride to school, every Friday CPS is
// in session, with two routes that both converge at Nettelhorst around
// 7:55am:
//   North Route: 7:40am Cornelia & Broadway -> 7:42am Elaine & Roscoe ->
//     7:45am Clark & Roscoe -> 7:47am Kenmore & Roscoe -> 7:48am Kenmore &
//     School -> 7:51am Dayton & Aldine -> 7:55am Nettelhorst
//   South Route: 7:45am Briar & Inner DLSD Trail -> 7:47am Oakdale & Inner
//     DLSD Trail -> 7:49am Oakdale & Pine Grove -> 7:52am Wellington &
//     Broadway -> 7:53am Briar & Broadway -> 7:55am Nettelhorst
// One event per in-session Friday (same "many rows, one shared source_url,
// collapsed by the next-occurrence CTE" pattern the recurring Gallagher Way
// movie nights already use), rather than a single event with no real date —
// this codebase has no true recurrence concept, see events/ingest.ts.
//
// "In session" is computed against the real seeded CPS 2026-27 calendar
// (school_breaks table, api/src/camps/seed-2026-08-04-school-breaks.ts) —
// every Friday from the school year's first day (2026-08-24) through its
// last (2027-06-11), excluding any Friday that overlaps a school_breaks row
// (a multi-day break, a Professional Development day, etc. — bike bus
// doesn't run when there's no school to ride to). Per the answered
// clarifying question, generated through the full school year rather than
// stopping partway.
const SCHOOL_YEAR_START = '2026-08-24'
const SCHOOL_YEAR_END = '2027-06-11'

const NETTELHORST_ADDRESS = '3252 N Broadway, Chicago, IL 60657'
const NETTELHORST_LAT = '41.941489'
const NETTELHORST_LNG = '-87.645136'
const SOURCE_URL = 'https://nettelhorstbikebus.org/'
// The org's own real logo (500x500, real photo-quality asset) — hand-verified
// via curl, bypassing page-extraction entirely (the /route schedule page has
// no usable photo of its own) per CandidateEvent.imageUrl's escape hatch.
const LOGO_IMAGE_URL = 'https://nettelhorstbikebus.org/assets/img/logo-bike.png'

const DESCRIPTION =
  "A community bike ride to school, rain or shine, every Friday Nettelhorst is in session. Two routes converge at Nettelhorst around 7:55am:\n\n" +
  'North Route: 7:40am Cornelia & Broadway, 7:42am Elaine & Roscoe, 7:45am Clark & Roscoe, 7:47am Kenmore & Roscoe, 7:48am Kenmore & School, 7:51am Dayton & Aldine.\n\n' +
  'South Route: 7:45am Briar & Inner DLSD Trail, 7:47am Oakdale & Inner DLSD Trail, 7:49am Oakdale & Pine Grove, 7:52am Wellington & Broadway, 7:53am Briar & Broadway.\n\n' +
  'Track the ride live at nettelhorst-bike-bus.glitch.me.'

function toDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function inSessionFridays(): Promise<string[]> {
  const breaks = await db.select({ startDate: schoolBreaks.startDate, endDate: schoolBreaks.endDate }).from(schoolBreaks)
  const breakRanges = breaks.map((b) => ({ start: toDateOnly(b.startDate), end: toDateOnly(b.endDate) }))

  function overlapsBreak(day: Date): boolean {
    return breakRanges.some((r) => day >= r.start && day <= r.end)
  }

  const start = toDateOnly(SCHOOL_YEAR_START)
  const end = toDateOnly(SCHOOL_YEAR_END)

  // Advance to the first Friday on/after start (getUTCDay: 0=Sun..6=Sat, Friday=5).
  const first = new Date(start)
  first.setUTCDate(first.getUTCDate() + ((5 - first.getUTCDay() + 7) % 7))

  const fridays: string[] = []
  for (let day = first; day <= end; day.setUTCDate(day.getUTCDate() + 7)) {
    if (!overlapsBreak(day)) {
      fridays.push(toIsoDate(day))
    }
  }
  return fridays
}

async function main() {
  const [existingSource] = await db.select().from(eventSources).where(eq(eventSources.url, SOURCE_URL)).limit(1)

  const sourceId =
    existingSource?.id ??
    (
      await db
        .insert(eventSources)
        .values({
          name: 'Nettelhorst Bike Bus',
          url: SOURCE_URL,
          type: 'website',
          notes:
            'Weekly community bike-to-school ride, every Friday CPS is in session. Two routes (North from Cornelia & ' +
            'Broadway, South from Briar & Inner DLSD Trail) both converge at Nettelhorst ~7:55am. See /route for the ' +
            'full stop-by-stop schedule; live tracker at nettelhorst-bike-bus.glitch.me during active rides.',
        })
        .returning({ id: eventSources.id })
    )[0].id

  const fridays = await inSessionFridays()
  console.log(`${fridays.length} in-session Fridays from ${SCHOOL_YEAR_START} through ${SCHOOL_YEAR_END}.`)

  const candidates: CandidateEvent[] = fridays.map((startDate) => ({
    title: 'Nettelhorst Bike Bus',
    description: DESCRIPTION,
    startDate,
    startTime: '07:40',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School',
    latitude: NETTELHORST_LAT,
    longitude: NETTELHORST_LNG,
    sourceUrl: SOURCE_URL,
    imageUrl: LOGO_IMAGE_URL,
    status: 'approved',
  }))

  const result = await ingestEvents(candidates, { sourceId, actor: 'claude:manual-sourcing-2026-08-17' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped.`)

  // ingestEvents' CandidateEvent has no topic field (it predates feedback
  // #97's topic picker) — tag every row from this source the same way
  // events/backfill-2026-08-16-topics.ts retroactively tagged the existing
  // 40 events, rather than leaving a whole recurring series untagged.
  const tagged = await db
    .update(events)
    .set({ topic: 'Sports & Fitness' })
    .where(and(eq(events.sourceId, sourceId), isNull(events.topic)))
    .returning({ id: events.id })
  console.log(`Tagged ${tagged.length} rows with topic 'Sports & Fitness'.`)

  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, sourceId))
}

await main()
process.exit(0)
