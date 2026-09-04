import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Feedback #152 (2026-09-04): "Roscoe Village Neighbors: Retro on Roscoe"
// had the generic Lakeview Roscoe Village Chamber of Commerce logo as its
// image — Ben: "not a good picture representing retro on Roscoe... should
// really relate to the event." The event's own source_url
// (lakeviewroscoevillage.org/events-calendar) is shared by 7 other events,
// so image-enrichment.ts's new isSharedListingPage() check now correctly
// skips page-extraction for it in favor of the per-event web image search —
// which needs a real description to search well (added in
// fix-2026-09-04-add-missing-descriptions-and-times.ts) since it's now a
// real 3-day street festival with live music, a classic car show, and
// vintage shopping, not just the bare chamber-calendar blurb it had before.
async function main() {
  const [event] = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(eq(events.title, 'Roscoe Village Neighbors: Retro on Roscoe'))
  if (!event) {
    console.log('Event not found.')
    return
  }

  const result = await enrichEventImage(event.id, {
    sourceUrl: event.sourceUrl,
    overrideImageUrl: null,
    title: event.title,
    description: event.description,
  })
  console.log(`Result: ${result}`)
}

await main()
process.exit(0)
