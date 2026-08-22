import 'dotenv/config'
import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events } from '../db/schema.js'

// Follow-up to backfill-2026-08-22-promote-recurring-sources.ts, extending
// the same "promote out of the generic-search bucket" fix to the events
// that ARE genuinely one-time/annual themselves (so the earlier fix's own
// >=2-occurrences test correctly left them alone) — confirmed with Ben:
// even when the specific event doesn't repeat, its host organization is a
// stable, real, ongoing entity that very likely puts on other events too
// (a chamber of commerce, a business alliance, a neighborhood association,
// a parish) — exactly the same shape as "the library," which already has
// its own dedicated CPL Merlo source. Leaving these filed under the generic
// bucket source meant the *host*, not just the one event, had no real page
// a future re-check pass could revisit.
//
// Every one of these hosts was verified live to be a real, reachable page
// (not a parked/dead domain — see Sports & Clubs' "Dance on Broadway
// incident" for why that check specifically matters) before being recorded
// here, and several turned out to have their own rich, real, ongoing events
// calendars with many more real events than the one this app already
// tracks (see this file's own notes fields, and CLAUDE.md's Events section
// for the two flagged as worth a future sourcing pass on their own merits).
const GENERIC_SEARCH_SOURCE_ID = '19b8d7be-0ceb-4b76-b82c-ba4554885ff9'

interface HostPromotion {
  sourceName: string
  sourceUrl: string
  notes: string
  eventTitles: string[]
}

const PROMOTIONS: HostPromotion[] = [
  {
    sourceName: 'Lakeview East Chamber of Commerce',
    sourceUrl: 'https://chicago.lakevieweast.com/events',
    notes:
      'Real, live member-business events calendar (happy hours, brunches, member specials) plus the chamber\'s own annual festivals — Clark Street Live, Dine Out on Broadway, and the Lakeview East Festival of the Arts. Verified live 2026-08-22; the calendar itself mostly shows day-to-day member-business events rather than the big annual festivals, which appear to be announced/promoted separately (their own event pages) rather than listed on this specific view.',
    eventTitles: ['Clark Street Live', 'Dine Out on Broadway', 'Lakeview East Festival of the Arts'],
  },
  {
    sourceName: 'Northalsted Business Alliance',
    sourceUrl: 'https://northalsted.com/upcoming/',
    notes:
      "Chamber of commerce for the Northalsted/Boystown business district. Real, live upcoming-events calendar; also runs Northalsted Market Days, Pride Fest/Parade, Haunted Halsted, and Taste of Northalsted (not all necessarily on this app's radar yet — a real lead for a future sourcing pass). Verified live 2026-08-22.",
    eventTitles: ['Northalsted Market Days'],
  },
  {
    sourceName: 'Southport Neighbors Association',
    sourceUrl: 'https://southportneighbors.com/events/',
    notes:
      'Not-for-profit neighborhood association (Addison to Irving Park, Clark to Ashland). Real, live events page listing the Quarterly Community Meeting and the annual Neighborhood Yard Sale directly. Verified live 2026-08-22.',
    eventTitles: ['Southport Neighbors Meeting', 'Southport Neighbors Yard Sale'],
  },
  {
    sourceName: 'St. Alphonsus Church',
    sourceUrl: 'https://www.stalphonsuschicago.org/',
    notes:
      "Catholic parish hosting the annual Oktoberfest Chicago beer garden (per Oktoberfest's own eventeny.com listing, which names the parish as the real host committee behind the event-management vendor). The parish's own /calendar page embeds a JS-rendered Google Calendar this codebase's tooling can't statically fetch — same limitation as other JS-only calendars elsewhere in this app (see CLAUDE.md's Camps sourcing notes) — so this is filed at the parish's real homepage rather than a page that can't actually be checked. Verified live 2026-08-22.",
    eventTitles: ['Oktoberfest Chicago'],
  },
  {
    sourceName: 'Lakeview Roscoe Village Chamber of Commerce',
    sourceUrl: 'https://www.lakeviewroscoevillage.org/events-calendar',
    notes:
      "Real host of Lakeview Taco Fest (per Taco Fest's own eventeny.com terms, naming this chamber — not the similarly-named but distinct Lakeview East Chamber — as the owning organization). A rich, real, live calendar with dozens of other real neighborhood events (Roscoe Village Farmers Market, Northside Networking, Trick or Treat on Southport, Lakeview Tree Lighting, Winterfest, etc.) not yet sourced into this app — a real lead for a future pass. Verified live 2026-08-22.",
    eventTitles: ['Lakeview Taco Fest'],
  },
]

async function getOrCreateSource(name: string, url: string, notes: string): Promise<string> {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id
  const [created] = await db.insert(eventSources).values({ name, url, type: 'website', notes }).returning({ id: eventSources.id })
  return created.id
}

async function main() {
  for (const promotion of PROMOTIONS) {
    const sourceId = await getOrCreateSource(promotion.sourceName, promotion.sourceUrl, promotion.notes)
    for (const title of promotion.eventTitles) {
      const updated = await db
        .update(events)
        .set({ sourceId })
        .where(and(eq(events.title, title), eq(events.sourceId, GENERIC_SEARCH_SOURCE_ID)))
        .returning({ id: events.id })
      console.log(`Re-filed ${updated.length} "${title}" row(s) under "${promotion.sourceName}".`)
    }
    await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, sourceId))
  }
}

await main()
process.exit(0)
