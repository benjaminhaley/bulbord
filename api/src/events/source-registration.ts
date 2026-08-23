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
//
// Returns the source's id either way (existing or newly created) — the
// caller sets the event's own source_id to it (feedback, 2026-08-23: "I
// don't see the root source... being added to event sources" — the source
// row itself *was* being created correctly, but the event was never linked
// to it via the real source_id FK, only via the free-text source_url
// field, so a join on source_id — like the admin sources list's own
// event_count, or resourcing.ts's own future use of the link — silently
// couldn't see the connection).
export async function registerDiscoveredEventSource(url: string, sourceName: string, actorUserId: string): Promise<string> {
  const [existing] = await db
    .select({ id: eventSources.id })
    .from(eventSources)
    .where(and(eq(eventSources.url, url), isNull(eventSources.deletedAt)))
    .limit(1)
  if (existing) return existing.id

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

  return created.id
}
