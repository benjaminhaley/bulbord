import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Found while chasing a real photo for "Butterfly Haven Yoga" (flagged by
// the full-image-sweep as a cargo-ship-named-YOGA mismatch): the event's
// own real dedicated page (naturemuseum.org/events/butterfly-haven-yoga-4426)
// states "Must be 18 or older to participate... must register online in
// advance; no drop-ins" — a genuine, explicit adult-only exclusion. This
// never made it into our stored description ("A rejuvenating yoga class in
// the Judy Istock Butterfly Haven"), which is why the second-pass validator
// (candidate-validation.ts) never flagged it — that check only ever sees
// what's already stored in the database, not the live source page, so an
// age restriction the original extraction pass failed to capture is
// invisible to every later text-based check. This is a relevance problem,
// not an image problem — no photo fixes an event that isn't for this
// audience at all. Removed rather than re-sourced.
const EVENT_ID = '6e8d55c1-5b72-4a50-9b7e-ccd194423fc0'

async function main() {
  const now = new Date()
  await db.update(events).set({ deletedAt: now, updatedAt: now }).where(eq(events.id, EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'Removed: the real source page states "Must be 18 or older to participate" — a genuine adult-only exclusion never captured in the stored description, so no text-based relevance check could catch it after the fact',
      eventId: EVENT_ID,
    },
  })

  console.log('Removed Butterfly Haven Yoga (confirmed 18+ requirement).')
}

await main()
process.exit(0)
