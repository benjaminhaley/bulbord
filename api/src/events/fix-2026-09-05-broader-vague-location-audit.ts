import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// A direct follow-up ("how many events were updated total? more than just
// the ones I pointed out, I hope") to the feedback #155-158 fixes prompted a
// full sweep of every currently-live approved event for the same three
// categories, not just the four Ben personally flagged — the same "check
// the whole table, not just what was reported" lesson this file's own
// history already established for duplicate-events cleanups (see
// fix-2026-09-03-sourcing-second-pass-dupes.ts). Found 4 more real
// vague-location cases (all from the same Northalsted/Roscoe cluster, all
// with address IS NULL and only a bare neighborhood/district name as
// location_name) — 3 fixable with a real, specifically-researched street
// address/intersection, one genuinely unaddressable. No crawl-format or
// age-restriction violations were found in the broader sweep beyond the
// three already fixed in fix-2026-09-04-feedback-155-156-157.ts (a
// title-match "crawl" hit, the Northalsted Halloween Pup Crawl, turned out
// on inspection to be a dog costume walk with no alcohol/bar involvement at
// all — not the bar-crawl shape the rule targets, just also vague-location).
//
// - "Retro on Roscoe" — a real annual street festival; the festival's own
//   host page (roscoevillage.org) gives the real block range.
// - "Haunted Halsted" — a real, well-documented annual parade; multiple
//   independent sources agree on the Halsted St route between Belmont Ave
//   and Brompton Ave, with the parade stepping off at Belmont.
// - "Northalsted Halloween Pup Crawl" — a real dog-costume walk (not a bar
//   crawl); Northalsted's own site gives the check-in intersection.
// - "A Night of Wellness" — checked directly at its real dedicated page
//   (northalsted.com/events/wellness/): venue/address for this specific
//   Oct 15, 2026 occurrence is explicitly "Details coming soon!" — a
//   different (February) occurrence of the same series has a real venue,
//   but assuming this occurrence repeats there would be inventing a fact
//   not actually published, so removed rather than guessed.
const ADDRESS_FIXES: { id: string; address: string }[] = [
  { id: 'bd3d494d-e7b8-4865-9f73-f137e3f85b88', address: 'Roscoe St between Damen Ave & Leavitt St, Chicago, IL 60618' }, // Retro on Roscoe
  { id: 'b67c7e70-f842-41cf-8725-78390212ec47', address: 'Halsted St between Belmont Ave & Brompton Ave, Chicago, IL 60657' }, // Haunted Halsted
  { id: 'd871b7a7-b07c-44ca-98a4-7f25f39e0247', address: 'Halsted St & Aldine Ave, Chicago, IL 60657' }, // Northalsted Halloween Pup Crawl
]
const REMOVE_EVENT_IDS = [
  'fca6039f-1025-4186-816d-9c80f150d99a', // A Night of Wellness — no venue published anywhere for this occurrence
]

async function main() {
  const now = new Date()

  for (const fix of ADDRESS_FIXES) {
    await db.update(events).set({ address: fix.address, updatedAt: now }).where(eq(events.id, fix.id))
  }

  const removed = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(events.id, REMOVE_EVENT_IDS[0]))
    .returning({ id: events.id, title: events.title })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'Follow-up full-table audit after feedback #155-158: found and fixed 3 more vague-location events (real street addresses researched directly) and removed 1 with no venue published anywhere, beyond the 4 events Ben personally flagged',
      addressFixedEventIds: ADDRESS_FIXES.map((f) => f.id),
      removedEventIds: removed.map((e) => e.id),
    },
  })

  console.log(`Address-fixed: ${ADDRESS_FIXES.length}`)
  console.log(`Soft-deleted: ${removed.map((e) => e.title).join(', ')}`)
}

await main()
process.exit(0)
