import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Feedback #147/#148/#149 (2026-09-04) — three more real, correctly-scraped
// listings that still don't belong, each reversing an earlier judgment call
// (see extraction-filters.ts for the going-forward rule each one produced):
//
// - "Past Trauma Process Group" (#147): a paid, individual-enrollment
//   support group, not a shared gathering neighbors go to together — kept in
//   the 2026-09-04 bar/nightlife cleanup as "a legitimate community mental
//   health resource," which Ben directly reversed: "not a community event
//   that you would expect neighbors to gather and go to together."
// - "DreamNight" (#148): a VIP evening at Lincoln Park Zoo explicitly for
//   "families with children impacted by severe illness" — a narrow,
//   invite-scoped population, not broadly accessible to the Nettelhorst
//   community generally.
// - "Bad Johnny's Wood" (#149): wood-fired pizza at Roscoe Village Pub
//   during a Bears game, with proceeds benefiting Mercy Home — kept in the
//   same earlier cleanup as a "charity fundraiser," which Ben reversed:
//   "it is not really a community event, just a restaurant naming that
//   they're open" — the charity tie-in doesn't turn a routine bar promotion
//   into something people gather FOR the cause to attend.
const REMOVE_EVENT_IDS = [
  '77e67d85-e332-490d-baa9-4a25d106c3b4', // Past Trauma Process Group
  '21253fdb-287f-44d7-8876-95b2f72a902a', // DreamNight
  '45f2895d-0f67-4b6e-9453-02f10b97674c', // Bad Johnny's Wood
]

async function main() {
  const now = new Date()
  const removed = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, REMOVE_EVENT_IDS))
    .returning({ id: events.id, title: events.title })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'feedback #147/#148/#149: removed an individual-enrollment support group, a narrow special-needs-only VIP event, and a routine bar promotion with a charitable tie-in — none are broadly-accessible community gatherings',
      eventIds: removed.map((e) => e.id),
    },
  })

  console.log(`Soft-deleted ${removed.length} events (expected ${REMOVE_EVENT_IDS.length}): ${removed.map((e) => e.title).join(', ')}`)
}

await main()
process.exit(0)
