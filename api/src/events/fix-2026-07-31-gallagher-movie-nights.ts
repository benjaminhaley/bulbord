import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Two problems found while fixing 2026-07-31 feedback ("all events should
// always have real images"):
//
// 1. Both events got a generated-placeholder image: gallagherway.com is a
//    JS-rendered SPA that doesn't even server-render per-event meta tags
//    (confirmed: og:title/og:image on every event URL are the same generic
//    site-wide values), so extraction had nothing to find. The site's own
//    generic branding image (gallagherway.com/img/og.jpg) is a real photo —
//    consistent with the existing "site logo" last-resort tier in
//    extract-page-image.ts — so used directly here instead of leaving null.
//
// 2. While chasing that, found the dates were also wrong. The original
//    source_url (a wgntv.com article) 403s to a plain fetch, so I'd sourced
//    "Aug 13"/"Aug 27" from an AI-summarized secondary search result that
//    turned out unreliable — cross-checking against mommypoppins.com's
//    directly-scraped, schema.org-tagged event page (real HTML, not an AI
//    summary) shows the actual dates are Aug 12 and Aug 26 (Wednesdays,
//    matching every other confirmed date in the season — gates open 6pm).
//    Corrected here and source_url switched to the mommypoppins page, which
//    is actually fetchable/re-verifiable (wgntv.com is not).

const GALLAGHER_LOGO_IMAGE = 'https://www.gallagherway.com/img/og.jpg'
const MOMMYPOPPINS_URL = 'https://mommypoppins.com/chicago-kids/event/events/movies-at-gallagher-way'

const fixes = [
  { id: '46435005-2a80-45f0-a7a3-572c7b0e62a9', title: 'High School Musical', correctDate: '2026-08-12' },
  { id: '61493a4e-0796-4941-b174-1e87125c36ff', title: 'Happy Gilmore', correctDate: '2026-08-26' },
]

async function main() {
  for (const fix of fixes) {
    await db
      .update(events)
      .set({ startDate: fix.correctDate, sourceUrl: MOMMYPOPPINS_URL, updatedAt: new Date() })
      .where(eq(events.id, fix.id))

    const result = await enrichEventImage(fix.id, { sourceUrl: null, overrideImageUrl: GALLAGHER_LOGO_IMAGE })

    await db.insert(eventsLog).values({
      actor: 'claude:fix-2026-07-31',
      action: 'event_corrected',
      metadata: { eventId: fix.id, title: fix.title, correctedDate: fix.correctDate, imageResult: result },
    })

    console.log(fix.title, '->', fix.correctDate, '| image:', result)
  }
  process.exit(0)
}

main()
