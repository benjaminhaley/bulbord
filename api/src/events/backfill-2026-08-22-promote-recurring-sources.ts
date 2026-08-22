import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Root-cause fix for feedback #119 (see CLAUDE.md's Events data model &
// sourcing section, "A one-off manual seed silently going stale"): several
// genuinely distinct recurring series (each with its own real, checkable
// page) were filed under the shared "Generic web search — near Nettelhorst
// School" bucket source, whose own `.url` is a Google search query — not any
// of these series' real pages. That's *why* the earlier bike-bus/French
// Market pattern (one dedicated event_sources row per real recurring
// series) never got applied to these: a "re-check every source" pass sees
// the bucket as one thing to eyeball, not N independent series each with
// its own expiration horizon.
//
// This promotes every recurring series still stuck in that bucket to its
// own dedicated source (matching Green City Market / Gallagher Way / Bike
// Bus), re-files their existing event rows, and adds the real confirmed
// continuation where one exists. A parallel audit of every other
// single-occurrence item in the same bucket (Baby Time, Northalsted Market
// Days, Oktoberfest Chicago, etc.) found the rest are genuinely one-time
// annual festivals — each has only ever had one row seeded, which is
// correct for something that recurs once a year, not a symptom of this bug.
// Two library programs turned out to belong under the *already-existing*
// CPL Merlo source instead of a new one.

const GENERIC_SEARCH_SOURCE_ID = '19b8d7be-0ceb-4b76-b82c-ba4554885ff9'
const MERLO_SOURCE_ID = 'f6198d6e-4390-4ad4-85b0-91bb318c637a'

async function getOrCreateSource(name: string, url: string, notes: string): Promise<string> {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id
  const [created] = await db.insert(eventSources).values({ name, url, type: 'website', notes }).returning({ id: eventSources.id })
  return created.id
}

async function refileEvents(title: string, fromSourceId: string, toSourceId: string) {
  const updated = await db
    .update(events)
    .set({ sourceId: toSourceId })
    .where(and(eq(events.title, title), eq(events.sourceId, fromSourceId)))
    .returning({ id: events.id })
  console.log(`Re-filed ${updated.length} "${title}" row(s) from ${fromSourceId} to ${toSourceId}.`)
}

function toDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
function weeklyDatesThrough(fromIso: string, throughIso: string, targetDow: number): string[] {
  const from = toDateOnly(fromIso)
  const through = toDateOnly(throughIso)
  const first = new Date(from)
  first.setUTCDate(first.getUTCDate() + ((targetDow - first.getUTCDay() + 7) % 7))
  const out: string[] = []
  for (let day = first; day <= through; day.setUTCDate(day.getUTCDate() + 7)) out.push(toIsoDate(day))
  return out
}

async function main() {
  const actor = 'claude:manual-sourcing-2026-08-22'
  const today = new Date().toISOString().slice(0, 10)

  // --- Nettelhorst French Market: promote to its own dedicated source ---
  const frenchMarketSourceId = await getOrCreateSource(
    'Nettelhorst French Market',
    'https://bensidounusa.com/nettelhorst/',
    "Weekly farmers/artisan market at Nettelhorst School (Bensidoun USA). Saturdays 8am-2pm, April 18 through Oct 31 (no market 9/19). Promoted out of the generic-search bucket 2026-08-22 (feedback #119) so a future re-check pass has this series' own real page to revisit.",
  )
  await refileEvents('Nettelhorst French Market', GENERIC_SEARCH_SOURCE_ID, frenchMarketSourceId)

  // --- Low-Line Market at Southport: promote to its own dedicated source, add continuation ---
  const lowLineSourceId = await getOrCreateSource(
    'Low-Line Market at Southport',
    'https://southportcorridorchicago.com/2026/04/28/chicagos-low-line-market-returns-for-2026-season-beneath-southport-corridor-tracks/',
    'Weekly farmers/artisan market under the Southport CTA tracks. Tuesdays 3pm, through Sept 29, 2026 (per the season-announcement page originally sourced 2026-07-29 — that page 403s on a plain fetch as of 2026-08-22, so this end date is carried forward from the earlier confirmed research, not re-verified live). Promoted out of the generic-search bucket 2026-08-22 (feedback #119).',
  )
  await refileEvents('Low-Line Market at Southport', GENERIC_SEARCH_SOURCE_ID, lowLineSourceId)

  const LOW_LINE_SEASON_END = '2026-09-29'
  const lowLineDates = weeklyDatesThrough(today, LOW_LINE_SEASON_END, 2) // Tuesday = 2
  const lowLineCandidates: CandidateEvent[] = lowLineDates.map((startDate) => ({
    title: 'Low-Line Market at Southport',
    description: 'Weekly farmers/artisan market under the Southport CTA tracks, Tuesdays through Sept 29, 2026.',
    startDate,
    startTime: '15:00',
    allDay: false,
    address: 'Southport Ave & Newport Ave (CTA Southport station), Chicago, IL 60657',
    locationName: 'Southport CTA Station',
    sourceUrl: 'https://southportcorridorchicago.com/2026/04/28/chicagos-low-line-market-returns-for-2026-season-beneath-southport-corridor-tracks/',
    status: 'approved',
  }))
  console.log('Low-Line Market continuation:', await ingestEvents(lowLineCandidates, { sourceId: lowLineSourceId, actor }))
  await db
    .update(events)
    .set({ topic: 'Community & Social' })
    .where(and(eq(events.sourceId, lowLineSourceId), eq(events.title, 'Low-Line Market at Southport'), isNull(events.topic)))

  // --- Sunday Crafternoon (Merlo): re-file to the existing CPL Merlo source, add confirmed continuation ---
  await refileEvents('Sunday Crafternoon', GENERIC_SEARCH_SOURCE_ID, MERLO_SOURCE_ID)
  const merloAddress = '644 W Belmont Ave, Chicago, IL 60657'
  // Confirmed live via chipublib.bibliocommons.com search 2026-08-22 — these
  // are the only two future dates currently published for this series (a
  // real, direct search, not a guess at further-out dates the library
  // hasn't announced yet).
  const crafternoonCandidates: CandidateEvent[] = [
    {
      title: 'Sunday Crafternoon',
      description: 'Beat the Sunday Scaries with a fun and relaxing craft. Create a stress ball in October. All materials provided.',
      startDate: '2026-10-11',
      startTime: '13:30',
      allDay: false,
      address: merloAddress,
      locationName: 'Chicago Public Library — Merlo Branch',
      sourceUrl: 'https://chipublib.bibliocommons.com/events/69f123b22866a5b4884b725a',
      status: 'approved',
    },
    {
      title: 'Sunday Crafternoon',
      description: 'Beat the Sunday Scaries with a fun and relaxing craft. Sculpt with clay in November. All materials provided.',
      startDate: '2026-11-08',
      startTime: '13:30',
      allDay: false,
      address: merloAddress,
      locationName: 'Chicago Public Library — Merlo Branch',
      sourceUrl: 'https://chipublib.bibliocommons.com/events/69f123b22866a5b4884b725a',
      status: 'approved',
    },
  ]
  console.log('Sunday Crafternoon continuation:', await ingestEvents(crafternoonCandidates, { sourceId: MERLO_SOURCE_ID, actor }))
  await db
    .update(events)
    .set({ topic: 'Arts & Crafts' })
    .where(and(eq(events.sourceId, MERLO_SOURCE_ID), eq(events.title, 'Sunday Crafternoon'), isNull(events.topic)))

  // --- Baby Time (Merlo): re-file only. Confirmed live via a system-wide
  // chipublib.bibliocommons.com search 2026-08-22 that this exact program
  // isn't currently offered at Merlo (it does still run under this name at
  // other branches, e.g. Blackstone) — so no continuation dates are
  // fabricated here, matching this codebase's "never invent a date the real
  // system doesn't confirm" rule. Left as a single past occurrence.
  await refileEvents('Baby Time', GENERIC_SEARCH_SOURCE_ID, MERLO_SOURCE_ID)

  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, frenchMarketSourceId))
  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, lowLineSourceId))
  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, MERLO_SOURCE_ID))
}

await main()
process.exit(0)
