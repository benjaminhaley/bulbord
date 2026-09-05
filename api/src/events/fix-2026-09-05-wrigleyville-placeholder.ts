import 'dotenv/config'

import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

// The 5 "Wrigleyville Night Market" rows had gallagherway.com's own
// loader.gif (a JS loading spinner, fixed at the root in
// extract-page-image.ts) as their image. After that fix, re-enrichment
// correctly rejected the site's generic og:image ("generic venue logo, not
// event photo") and found nothing better via web search — a real,
// specifically-labeled photo of this exact market could not be found after
// several direct attempts (Time Out's own photo for this venue was mislabeled
// as a different event; Gallagher Way's own pages have no static real photo,
// everything is JS-lazy-loaded). Replaced the broken loading-spinner state
// with an honest placeholder rather than leave a blank/degenerate image live.
const EVENT_IDS = [
  '1a12da32-0500-44d0-b2a1-b1e00a0895ad',
  '68f07e93-c3c8-48c3-bcc2-df5df646dd1b',
  '831593cd-2da5-443d-9511-685d6637ddb0',
  '926c7123-5e97-4c2a-a1f5-8c7b4eb118d9',
  'e607436f-edf9-4d9c-8b33-3e32759a734d',
]

async function main() {
  const rows = await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, EVENT_IDS))

  for (const row of rows) {
    const placeholder = await uploadPlaceholderImage(row.title, 'events')
    await db
      .update(events)
      .set({ imageUrl: placeholder.imageUrl, thumbnailUrl: placeholder.thumbnailUrl, sourceImageUrl: null, updatedAt: new Date() })
      .where(eq(events.id, row.id))
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'Full-image-sweep follow-up: replaced a broken loading-spinner image with an honest placeholder after real-photo research came up empty',
      eventIds: rows.map((r) => r.id),
    },
  })

  console.log(`Done: ${rows.length} events.`)
}

await main()
process.exit(0)
