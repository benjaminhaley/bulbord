import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { getImageObject } from '../uploads/storage.js'

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
// Calls getImageObject() directly — the exact same function the real
// GET /uploads/* route calls — rather than a separate raw S3 read, since
// this function runs as part of the same deployed service real users hit;
// a raw SDK check from a different environment (a local script, this
// sandbox) can give a falsely reassuring answer if that environment
// happens to reach a different storage backend edge than the deployed
// service does, which is the exact shape of bug that motivated this in
// the first place.
function keyFromImageUrl(url: string): string {
  return url.replace(/^\/uploads\//, '')
}

export interface BrokenImage {
  eventId: string
  title: string
  imageUrl: string
}

// Read-only and cheap (a HEAD-equivalent object lookup per event, no
// downloads/vision calls) — safe to run on every page load of its own
// admin view, not just on an explicit button press, the same "don't make
// someone remember to click a button" posture as the existing data-
// freshness badge.
export async function checkImageHealth(): Promise<BrokenImage[]> {
  const rows = await db
    .select({ id: events.id, title: events.title, imageUrl: events.imageUrl, thumbnailUrl: events.thumbnailUrl })
    .from(events)
    .where(and(isNull(events.deletedAt), eq(events.status, 'approved')))

  const broken: BrokenImage[] = []
  for (const row of rows) {
    const [image, thumbnail] = await Promise.all([
      getImageObject(keyFromImageUrl(row.imageUrl)),
      getImageObject(keyFromImageUrl(row.thumbnailUrl)),
    ])
    if (!image || !thumbnail) {
      broken.push({ eventId: row.id, title: row.title, imageUrl: row.imageUrl })
    }
  }
  return broken
}
