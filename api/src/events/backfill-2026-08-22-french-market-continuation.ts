import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Feedback #119: "why isn't the Nettelhorst farmers market listed today?"
// Root cause: the original 2026-07-29 manual sourcing pass (see
// update-2026-08-03-manual-sourcing-pass.ts's sibling scripts from that same
// batch) only ever seeded three occurrences of the Nettelhorst French
// Market — Aug 1, 8, 15 — as a one-off hand-vetted pass, not a recurring
// scrape. The market's own page (bensidounusa.com/nettelhorst/, re-fetched
// 2026-08-22) confirms it actually runs every Saturday, 8am-2pm, April 18
// through October 31, with no market on 9/19 — so every Saturday from Aug 22
// onward was simply never ingested, not cancelled or removed.
//
// Reusing the existing event_sources row the original 3 rows were filed
// under (the 2026-07-29 "Generic web search — near Nettelhorst School" hand
// sourcing pass — a real event_sources.id, distinct from each event's own
// per-occurrence source_url field) and the same "many rows, one shared
// source_url, collapsed by the next-occurrence CTE" pattern as the Gallagher
// Way movie nights / Bike Bus (see seed-2026-08-17-bike-bus.ts) rather than
// inventing a real recurrence concept. No imageUrl override, same as the
// original 3 rows — each occurrence gets its own real-photo extraction pass
// off the source page via the normal image-enrichment pipeline.
const EVENT_SOURCE_NAME = 'Generic web search — near Nettelhorst School'
const SOURCE_URL = 'https://bensidounusa.com/nettelhorst/'
const NETTELHORST_ADDRESS = '3252 N Broadway, Chicago, IL 60657'
const NETTELHORST_LAT = '41.941489'
const NETTELHORST_LNG = '-87.645136'
const DESCRIPTION =
  "Lakeview's premiere farmers market, right at the school — produce, flowers, and local vendors. Saturdays 8am-2pm, April 18 through Oct 31 (no market 9/19)."

const SEASON_END = '2026-10-31'
const NO_MARKET_DATE = '2026-09-19'

function toDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function nextSaturdays(fromIso: string, throughIso: string): string[] {
  const from = toDateOnly(fromIso)
  const through = toDateOnly(throughIso)

  // getUTCDay: 0=Sun..6=Sat, Saturday=6.
  const first = new Date(from)
  first.setUTCDate(first.getUTCDate() + ((6 - first.getUTCDay() + 7) % 7))

  const saturdays: string[] = []
  for (let day = first; day <= through; day.setUTCDate(day.getUTCDate() + 7)) {
    const iso = toIsoDate(day)
    if (iso !== NO_MARKET_DATE) saturdays.push(iso)
  }
  return saturdays
}

async function main() {
  const [source] = await db.select().from(eventSources).where(eq(eventSources.name, EVENT_SOURCE_NAME)).limit(1)
  if (!source) throw new Error(`Expected an existing event_sources row named "${EVENT_SOURCE_NAME}"`)

  // Today (Chicago-local, but this only needs to be "on or after today" —
  // the ingest dedup on (title, start_date, source_url) already makes this
  // safe to run again later without duplicating anything).
  const today = new Date().toISOString().slice(0, 10)
  const saturdays = nextSaturdays(today, SEASON_END)
  console.log(`${saturdays.length} remaining Saturdays from ${today} through ${SEASON_END} (excluding ${NO_MARKET_DATE}).`)

  const candidates: CandidateEvent[] = saturdays.map((startDate) => ({
    title: 'Nettelhorst French Market',
    description: DESCRIPTION,
    startDate,
    startTime: '08:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School',
    latitude: NETTELHORST_LAT,
    longitude: NETTELHORST_LNG,
    sourceUrl: SOURCE_URL,
    status: 'approved',
  }))

  const result = await ingestEvents(candidates, { sourceId: source.id, actor: 'claude:manual-sourcing-2026-08-22' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped.`)

  // This event_sources row is shared across many unrelated series (Low-Line
  // Market, Northalsted Market Days, etc. — see the 2026-07-29 manual
  // sourcing pass), so scope the topic backfill by title too, not just
  // sourceId, to avoid touching any other series' rows.
  const tagged = await db
    .update(events)
    .set({ topic: 'Community & Social' })
    .where(and(eq(events.sourceId, source.id), eq(events.title, 'Nettelhorst French Market'), isNull(events.topic)))
    .returning({ id: events.id })
  console.log(`Tagged ${tagged.length} rows with topic 'Community & Social'.`)

  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, source.id))
}

await main()
process.exit(0)
