import 'dotenv/config'

import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Found by the full-image-sweep audit: all 36 "Nettelhorst Bike Bus" rows
// share the org's own real logo (a deliberate seed-time choice per
// CLAUDE.md, since the routes page itself had no usable photo at the time)
// — a real, legitimate fallback, but one the new #158 scoring standard
// correctly flags as not "compelling" or specific to the actual event. A
// real, on-topic photo exists: chi.streetsblog.org's 2022 article on the
// Nettelhorst bike bus (credited "Photo: Christina Hayford") shows parents
// and kids biking together on Roscoe St near school, cargo bikes and all —
// opened and looked at directly before using it, per this codebase's own
// "never trust quality-gate-pass alone" rule.
//
// Run through the real enrichEventImage() pipeline (not a raw DB write) on
// one row first to confirm it actually passes the quality + new relevance
// gates, then the resulting internal (re-hosted) image/thumbnail URLs are
// copied to the other 35 same-titled rows directly — same "same title may
// share one real photo" reuse this codebase already established for the
// Harry and the Hendersons sibling fix, avoiding 35 redundant
// download/quality/relevance passes for bytes that already passed once.
const REAL_PHOTO_URL =
  'https://chi.streetsblog.org/wp-content/uploads/sites/15/2022/11/Screen-Shot-2022-11-21-at-6.05.24-PM.png?w=1024'

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description })
    .from(events)
    .where(eq(events.title, 'Nettelhorst Bike Bus'))

  if (rows.length === 0) throw new Error('No Nettelhorst Bike Bus rows found')

  const [first, ...rest] = rows
  const { result } = await enrichEventImage(first.id, {
    sourceUrl: null,
    overrideImageUrl: REAL_PHOTO_URL,
    title: first.title,
    description: first.description,
  })
  if (result !== 'sourced') throw new Error('Real photo failed the quality/relevance gate — investigate before proceeding')

  const [updated] = await db
    .select({ imageUrl: events.imageUrl, thumbnailUrl: events.thumbnailUrl, sourceImageUrl: events.sourceImageUrl })
    .from(events)
    .where(eq(events.id, first.id))

  const restIds = rest.map((r) => r.id)
  await db
    .update(events)
    .set({ imageUrl: updated.imageUrl, thumbnailUrl: updated.thumbnailUrl, sourceImageUrl: updated.sourceImageUrl, updatedAt: new Date() })
    .where(inArray(events.id, restIds))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'Full-image-sweep follow-up: replaced the generic org logo with a real, verified photo of the actual bike bus across all occurrences',
      eventIds: rows.map((r) => r.id),
      photoSource: REAL_PHOTO_URL,
    },
  })

  console.log(`Applied real photo to ${rows.length} Bike Bus events.`)
}

await main()
process.exit(0)
