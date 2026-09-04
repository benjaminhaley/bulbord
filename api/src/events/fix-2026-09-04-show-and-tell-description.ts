import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Follow-up to feedback #152: "Show & Tell for Grown-Ups" had a description
// that only named its sponsor/grant ("Presented by Tell Me Why It's Cool,
// supported by the SSA 27 Community Events & Placemaking Grant") without
// explaining what the event actually is. Real description found via web
// search of the show's own site (tellmewhyshow.com): a monthly night of
// short talks at Snakes & Lattes, Roscoe Village.
const EVENT_ID = '96bb0c11-5b56-4a7f-ad95-6dd9a1e1295d'
const DESCRIPTION =
  'A monthly night of short talks at Snakes & Lattes — each presenter gets 5 minutes to explain why something they love is cool, then takes audience questions.'

async function main() {
  const [row] = await db
    .update(events)
    .set({ description: DESCRIPTION, updatedAt: new Date() })
    .where(eq(events.id, EVENT_ID))
    .returning({ id: events.id, title: events.title })

  if (!row) {
    console.log('Event not found.')
    return
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: { reason: 'feedback #152 follow-up: added a real description for Show & Tell for Grown-Ups, found via web search', eventId: EVENT_ID },
  })

  console.log(`Updated description for "${row.title}" (${row.id})`)
}

await main()
process.exit(0)
