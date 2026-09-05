import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

// Two separate real enrichment attempts (fix-2026-09-04-c3-info-session-
// image.ts, run twice a day apart) both correctly rejected every Wikimedia
// candidate found for this event via the new scoreImageRelevance() step
// ("speaker at podium, unrelated," "text-heavy flyer for an unrelated
// workshop") — confirming the scorer works, but Wikimedia genuinely has no
// real photo for "virtual sustainability leadership training info session."
// Rather than leave the previous, actively-misleading forest-cleanup photo
// in place (real, sharp, well-sized — but of a different C3 program
// entirely), fall back to a plain generated placeholder — honest, matching
// this codebase's "no fake/broken substitute" posture, same as any other
// candidate that can't find a real match.
const EVENT_ID = '79803568-7dc3-4b15-a74e-718edf98697e'

async function main() {
  const [row] = await db.select({ title: events.title }).from(events).where(eq(events.id, EVENT_ID))
  if (!row) throw new Error('Event not found')

  const placeholder = await uploadPlaceholderImage(row.title, 'events')
  await db
    .update(events)
    .set({ imageUrl: placeholder.imageUrl, thumbnailUrl: placeholder.thumbnailUrl, sourceImageUrl: null, updatedAt: new Date() })
    .where(eq(events.id, EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'feedback #158 follow-up: two real enrichment attempts correctly rejected every found candidate as a mismatch; replaced the previous mismatched real photo with an honest generated placeholder rather than leave it',
      eventId: EVENT_ID,
    },
  })

  console.log('Done.')
}

await main()
process.exit(0)
