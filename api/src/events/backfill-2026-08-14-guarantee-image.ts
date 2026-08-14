import 'dotenv/config'
import { eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, events, eventsLog } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

// One-time backfill run immediately before making events.image_url/
// camps.image_url NOT NULL (feedback, 2026-08-14 — see CLAUDE.md's Images &
// object storage section) — a column can't be altered to NOT NULL while any
// row still has a null value. Every event/camp still missing an image (real
// extraction never found one, or it predates image enrichment entirely) gets
// a generated placeholder, same as any other insert path going forward.
async function main() {
  const eventRows = await db.select({ id: events.id, title: events.title }).from(events).where(isNull(events.imageUrl))
  for (const row of eventRows) {
    const placeholder = await uploadPlaceholderImage(row.title, 'events')
    await db
      .update(events)
      .set({ imageUrl: placeholder.imageUrl, thumbnailUrl: placeholder.thumbnailUrl, updatedAt: new Date() })
      .where(eq(events.id, row.id))
  }

  const campRows = await db.select({ id: camps.id, title: camps.title }).from(camps).where(isNull(camps.imageUrl))
  for (const row of campRows) {
    const placeholder = await uploadPlaceholderImage(row.title, 'camps')
    await db
      .update(camps)
      .set({ imageUrl: placeholder.imageUrl, thumbnailUrl: placeholder.thumbnailUrl, updatedAt: new Date() })
      .where(eq(camps.id, row.id))
  }

  await db.insert(eventsLog).values({
    actor: 'claude:guarantee-image-backfill-2026-08-14',
    action: 'images_guaranteed_backfill',
    metadata: { eventsBackfilled: eventRows.length, campsBackfilled: campRows.length },
  })

  console.log(`${eventRows.length} event(s) and ${campRows.length} camp(s) backfilled with a placeholder image.`)
}

await main()
process.exit(0)
