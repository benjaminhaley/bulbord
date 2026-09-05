import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { objectExists } from '../uploads/storage.js'

// Direct response to a real production incident (2026-09-05): a one-off
// script uploaded a replacement image directly to the storage bucket from
// a local script rather than through the live API, and the object never
// became visible through the deployed API's own /uploads/* proxy — a
// known, previously-documented propagation gap (see CLAUDE.md's Images &
// object storage section) between whatever backend edge a local write
// lands on and the one the deployed service reads from. The DB row looked
// completely fine (a real key, a script that printed "done"); the only way
// anyone found out it was actually broken was Ben noticing a broken-image
// icon while browsing the app on his phone. That's exactly the "requires
// so much manual review" gap this closes: a real, repeatable, on-demand
// check — not a one-off script run once and forgotten — that answers "is
// every event's stored image actually servable right now" from the same
// vantage point real traffic uses.
//
// Uses objectExists() — a lightweight HEAD, not a full download — against
// the exact same bucket/credentials the real GET /uploads/* route reads
// from, so this answers the same question a real request would, just
// without transferring image bytes for every one of a few hundred events.
function keyFromImageUrl(url: string): string {
  return url.replace(/^\/uploads\//, '')
}

export interface BrokenImage {
  eventId: string
  title: string
  imageUrl: string
}

const CHECK_CONCURRENCY = 15

// Read-only and cheap (a HEAD request per event, no downloads/vision
// calls) — safe to run on every page load of its own admin view, not just
// on an explicit button press, the same "don't make someone remember to
// click a button" posture as the existing data-freshness badge. Bounded
// concurrency, same reasoning as image-enrichment.ts's own
// ENRICH_CONCURRENCY: checking a few hundred events one at a time was slow
// enough in practice to risk the request itself timing out before it ever
// finished — found by actually calling this against production once it
// shipped, not assumed safe from the code alone.
export async function checkImageHealth(): Promise<BrokenImage[]> {
  const rows = await db
    .select({ id: events.id, title: events.title, imageUrl: events.imageUrl, thumbnailUrl: events.thumbnailUrl })
    .from(events)
    .where(and(isNull(events.deletedAt), eq(events.status, 'approved')))

  const broken: BrokenImage[] = []
  let index = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      const [imageOk, thumbnailOk] = await Promise.all([
        objectExists(keyFromImageUrl(row.imageUrl)),
        objectExists(keyFromImageUrl(row.thumbnailUrl)),
      ])
      if (!imageOk || !thumbnailOk) {
        broken.push({ eventId: row.id, title: row.title, imageUrl: row.imageUrl })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, rows.length) }, worker))
  return broken
}
