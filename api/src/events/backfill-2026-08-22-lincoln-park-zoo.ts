import 'dotenv/config'
import { and, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Follow-up to the umbrella-aggregator research (feedback, 2026-08-22, "is
// there some umbrella organization... seems like there should be"): a
// WebSearch pass scoped to chicagoparent.com/chicagokids.com (both real, but
// chicagoparent.com CloudFront-blocks direct browsing entirely — see
// CLAUDE.md's checklist item 10) surfaced two real Lincoln Park Zoo events
// this app didn't track yet (Spooky Zoo, ZooLights), and — a real instance
// of the exact item-9 rule this same day already established — found the
// existing "Fall Fest at Lincoln Park Zoo" row filed under the *aggregator*
// (Chicago Parent Magazine) as its source_id rather than the zoo's own real
// page, even though the zoo obviously has one. Every date below was
// re-verified directly against lpzoo.org's own calendar/event pages, not
// trusted from the aggregator or a third-party search summary alone — a
// third-party article claimed Spooky Zoo was Oct 22, the zoo's own page
// says Oct 17; the primary source wins.
const CHICAGO_PARENT_SOURCE_ID = 'b29b5c9a-8584-4a96-8af2-eb972488a187'
const LINCOLN_PARK_ZOO_ADDRESS = '2001 N Clark St, Chicago, IL 60614'

async function getOrCreateSource(name: string, url: string, notes: string): Promise<string> {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id
  const [created] = await db.insert(eventSources).values({ name, url, type: 'website', notes }).returning({ id: eventSources.id })
  return created.id
}

async function main() {
  const sourceId = await getOrCreateSource(
    'Lincoln Park Zoo',
    'https://www.lpzoo.org/calendar-events/',
    "Real, live events calendar. 21+ nightlife events (Adults Night Out, '80s vs '90s Night) and the 16+-only Haunted History Tours are deliberately out of scope for this family-events app — confirmed the age restriction directly rather than assuming from the name. Fall Fest was previously misfiled under the Chicago Parent Magazine aggregator source; re-filed here 2026-08-22.",
  )

  const [updated] = await db
    .update(events)
    .set({ sourceId })
    .where(and(eq(events.title, 'Fall Fest at Lincoln Park Zoo'), eq(events.sourceId, CHICAGO_PARENT_SOURCE_ID)))
    .returning({ id: events.id })
  console.log('Re-filed Fall Fest:', updated ? 1 : 0)

  const candidates: CandidateEvent[] = [
    {
      title: 'Spooky Zoo',
      description: 'Free trick-or-treat experience around the zoo. All ages welcome to wear costumes.',
      startDate: '2026-10-17',
      allDay: true,
      address: LINCOLN_PARK_ZOO_ADDRESS,
      locationName: 'Lincoln Park Zoo',
      sourceUrl: 'https://www.lpzoo.org/event/spooky-zoo/',
      status: 'approved',
    },
    {
      title: 'ZooLights',
      description:
        'Holiday light display with over 3 million lights. Runs November 20 through January 3, 4:30-9pm (last entry 8pm) — this listing covers opening night.',
      startDate: '2026-11-20',
      startTime: '16:30',
      allDay: false,
      address: LINCOLN_PARK_ZOO_ADDRESS,
      locationName: 'Lincoln Park Zoo',
      sourceUrl: 'https://www.lpzoo.org/event/zoolights/',
      status: 'approved',
    },
  ]
  const result = await ingestEvents(candidates, { sourceId, actor: 'claude:manual-sourcing-2026-08-22' })
  console.log('Lincoln Park Zoo new events:', result)

  const tagged = await db
    .update(events)
    .set({ topic: 'Community & Social' })
    .where(and(eq(events.sourceId, sourceId), eq(events.title, 'Spooky Zoo')))
    .returning({ id: events.id })
  console.log(`Tagged ${tagged.length} Spooky Zoo rows.`)
  const taggedZoolights = await db
    .update(events)
    .set({ topic: 'Community & Social' })
    .where(and(eq(events.sourceId, sourceId), eq(events.title, 'ZooLights')))
    .returning({ id: events.id })
  console.log(`Tagged ${taggedZoolights.length} ZooLights rows.`)

  await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, sourceId))
}

await main()
process.exit(0)
