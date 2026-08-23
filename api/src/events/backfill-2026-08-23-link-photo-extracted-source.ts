import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// One-off, targeted fix for the specific event/source pair Ben was looking
// at when he reported the bug (feedback, 2026-08-23: "I added the event, but
// I don't see the root source the Hawthorne PTA being added to event
// sources to check regularly"). The event and the event_sources row were
// both created correctly by the photo-extraction flow — the only thing
// missing was the events.source_id FK linking them, which POST /events
// never set (see routes.ts's now-fixed registerDiscoveredEventSource call
// sites). This script links that one pre-existing event; the code fix
// itself covers every event created from here on.
const EVENT_ID = '78e61d91-8c4b-4d14-b925-4b07fa92a908' // "Family Fun Fest"
const SOURCE_ID = '14c0ca09-9516-4737-ba29-1f6edcf16360' // "Hawthorne Scholastic Academy PTA"

async function main() {
  const [updated] = await db
    .update(events)
    .set({ sourceId: SOURCE_ID, updatedAt: new Date() })
    .where(eq(events.id, EVENT_ID))
    .returning({ id: events.id, title: events.title })

  if (!updated) {
    console.log(`No event found with id ${EVENT_ID} — nothing to do.`)
    return
  }

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-08-23',
    action: 'event_source_linked',
    metadata: { eventId: EVENT_ID, sourceId: SOURCE_ID },
  })

  console.log(`Linked "${updated.title}" (${EVENT_ID}) to source ${SOURCE_ID}.`)
}

await main()
process.exit(0)
