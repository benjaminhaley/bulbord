import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, eventsLog } from '../db/schema.js'

// A member's photo-extracted event submission can surface a real source URL
// — either printed on the poster itself, or found via a live web search
// (see photo-extraction.ts's findSourceUrl) — for an organization this app
// didn't already track. Registering it here is what makes it "part of the
// list of sources we might want to crawl regularly" (Ben, 2026-08-23), not
// just a one-off field on this one event: the same event_sources table the
// admin "re-run event sourcing" tool (resourcing.ts) already crawls.
//
// Called from POST /events, after the event itself is already created, and
// wrapped there in a try/catch — a failure here must never undo or block
// the actual event creation. Dedups on exact URL: a source already known
// under this URL is left alone rather than duplicated.
export async function registerDiscoveredEventSource(url: string, sourceName: string, actorUserId: string): Promise<void> {
  const [existing] = await db
    .select({ id: eventSources.id })
    .from(eventSources)
    .where(and(eq(eventSources.url, url), isNull(eventSources.deletedAt)))
    .limit(1)
  if (existing) return

  const [created] = await db
    .insert(eventSources)
    .values({
      name: sourceName,
      url,
      type: 'website',
      isActive: true,
      // Unverified/inferred, same "flag it, don't present as fact" posture
      // as this codebase's other auto-discovered data (e.g. camps'
      // price_is_estimated) — a human should confirm this is really the
      // organization's own page before leaning on it for regular re-crawls.
      notes:
        "Discovered automatically from a member's photo-extracted event submission (feedback #93) — verify this is really the organization's own page before relying on it for regular re-crawling.",
    })
    .returning({ id: eventSources.id })

  await db.insert(eventsLog).values({
    actor: actorUserId,
    action: 'event_source_created',
    metadata: { sourceId: created.id, discoveredVia: 'photo_extraction' },
  })
}
