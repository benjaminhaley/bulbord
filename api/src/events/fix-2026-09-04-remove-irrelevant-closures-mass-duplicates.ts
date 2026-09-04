import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events, eventsLog } from '../db/schema.js'

// Feedback #134/#135/#136/#137 (2026-09-04) — a batch of specific problems
// found in the events the weekly sourcing cron (feedback #131) had just
// pulled in. Each category below was confirmed with Ben before running (see
// this session's clarifying questions):
//
// 1. Bar/nightlife drink-and-entertainment promos and B2B-only listings
//    (#134) — real, correctly-scraped events that still don't belong on a
//    family-focused app. Ben's own generalization when confirming the two
//    borderline cases (Draglicious, the true-crime exhibit): the test isn't
//    "does this have a bar" or "does this lack neighborhood appeal," it's
//    whether a Nettelhorst family with pre-K-8 kids would find it relevant.
//    Applied here to every matching listing found across the three chamber/
//    business-alliance sources, not just the two examples in the feedback's
//    own screenshot — see extraction-filters.ts for the going-forward rule.
// 2. "Labor Day Mass" (#135) — a members-only church service, not open to
//    the broader community (contrast Oktoberfest Chicago, also from St.
//    Alphonsus Church, which stays — a real public neighborhood festival).
// 3. Closure/unavailability notices (#136) — "Library Closed" and every
//    "No School: X" entry. Confirmed with Ben: a day off school is real,
//    useful information, but belongs in this app's own camp/school-break
//    calendar, not as an Events listing with nothing to attend.
// 4. Cross-source duplicates (#137) — "Lowline Market" (a generic chamber
//    calendar scrape, no address) duplicating "Low-Line Market at Southport"
//    (its own dedicated source); "Yard Sale" (same chamber) duplicating
//    "Southport Neighbors Yard Sale" (its own dedicated source). See
//    duplicate-detection.ts for the mechanism now in ingestEvents() that
//    catches this shape going forward.
//
// A fifth, larger finding surfaced while investigating #136/#139: the entire
// "Hawthorne Scholastic Academy PTA" source (added 2026-08-23 from a photo-
// extraction test, feedback #93) is a DIFFERENT nearby school's own internal
// PTA calendar — curriculum nights, PTA meetings, field trips, fundraisers,
// graduation, none of it Nettelhorst content. Confirmed with Ben: remove the
// source and every event it produced entirely, handled separately below
// since it's keyed by source_id rather than by title.

const REMOVE_EVENT_IDS = [
  // --- #134: bar/nightlife/B2B, not relevant to a pre-K-8 family audience ---
  '051c489c-5620-40fe-ac96-003890cd3d07', // 4x4x4 Happy Hours, Sep 3
  '6fe9c193-c4ae-4b6a-83bf-b4a5f5cce6bb', // 4x4x4 Happy Hours, Sep 5
  '35c07797-bfcb-48e8-b4bb-57202dca67c5', // Bottomless Brunch
  'f09c5b8a-90ff-427d-9fff-897678e53506', // Brunch Happy Hour, Sep 4
  'a43a510c-1169-402d-94fb-22c70e7ef247', // Brunch Happy Hour, Sep 7
  '516b1a78-e931-4c0f-8ab5-ec88220b65db', // Draglicious
  '63c64e95-8301-41b3-9ff5-4a226bd3f620', // Happy Hour @ Big Star Wrigleyville
  '17a1cc5c-df17-4221-a3d5-5b51e4c55772', // Happy Hour @ Trader Todd's
  'bf60dd3e-0d3d-4b21-bedd-a09d5f32e476', // Karaoke, Sep 3
  '188bc5f8-528e-40fe-8920-4a3a6a404346', // Karaoke, Sep 4
  'a12a0a6d-f2e4-4d6e-aefd-2c6a3542bf53', // Karaoke, Sep 5
  'c591ee2c-cd3f-4bca-b7c8-4c2b633572ef', // Karaoke, Sep 6
  'cdf387e3-2a9b-467b-a427-12a4e6edf5a5', // SERIAL KILLER: THE EXHIBIT
  '567141d3-2329-4c96-a26e-41c89dfa450e', // Wine, Cheese, and Keys
  '748d4862-1a4d-4df8-9691-edeb884cf66d', // Bar Roma Pop-Up ($130/guest wine dinner)
  '362531f7-03d6-49c9-b938-59de9272f8c9', // Le Sud Harvest Night: Fall Wine Tasting
  'f68bbf04-065f-4c55-89f0-0f68f2ab9db5', // Business Storefront Improvements: Session 1
  '1ba684b5-bdbe-43b0-956f-484cde855a0f', // Business Storefront Improvements: Session 2
  'f9d9df93-aa65-48b1-90b5-4a403cbbc093', // Business Storefront Improvements: Session 3
  '3d0ddb23-a8a7-4ae0-a45e-feb21d8227bb', // Coffee & Commerce (small-business networking)
  'ff4bfefb-42f4-4c2b-9d13-ba3610c7f2ed', // Network Night (business networking)
  '285b8518-dd25-46e0-810a-f1ac92c1337c', // Network on the River (business networking)
  'c212ca91-ff59-4637-b291-f2814378ade8', // Connecting through Touch: A Workshop for Couples
  '21a55072-a56d-4e0e-9136-40aceb714257', // Trivia Night @ Roscoe Village Pub

  // --- #135: members-only church service ---
  'db1c1867-2c71-4d60-84a8-08bdc6095776', // Labor Day Mass

  // --- #136: closure/unavailability notices ---
  '6e4cca91-8666-4eaf-afb4-c95809f8f5fd', // Labor Day — Library Closed
  'd2a96db8-42d0-4682-82e8-5ea193740639', // Thanksgiving Day — Library Closed
  '6b9b67a1-93fa-45d0-9b85-fad147f706ba', // Christmas Day — Library Closed

  // --- #137: cross-source duplicates (generic chamber-calendar copy) ---
  '4b518196-1837-449c-b084-48cbe6de37d5', // Lowline Market, Sep 8 — dup of Low-Line Market at Southport
  '721fedfe-ca9b-4ccf-b28f-56f3bd977e02', // same, Sep 15
  '30577fe4-b11e-4717-9bcc-315797ae2e5a', // same, Sep 22
  '2c14e09c-74a4-4c52-9fa2-7ca607cc8233', // same, Sep 29
  '185bff14-122d-4f8b-a36d-f0fd9a5f3c53', // Yard Sale — dup of Southport Neighbors Yard Sale
]

const HAWTHORNE_SOURCE_ID = '14c0ca09-9516-4737-ba29-1f6edcf16360' // "Hawthorne Scholastic Academy PTA"

async function main() {
  const now = new Date()

  const removed = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, REMOVE_EVENT_IDS))
    .returning({ id: events.id })

  const hawthorneEvents = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(events.sourceId, HAWTHORNE_SOURCE_ID))
    .returning({ id: events.id })

  await db.update(eventSources).set({ isActive: false, updatedAt: now }).where(eq(eventSources.id, HAWTHORNE_SOURCE_ID))

  await db.insert(eventsLog).values([
    {
      actor: 'claude:manual-sourcing',
      action: 'event_corrected',
      metadata: {
        reason:
          'feedback #134/#135/#136/#137: removed recurring bar/nightlife/B2B promos not relevant to a pre-K-8 family audience, a members-only church service, closure/no-school notices, and cross-source duplicates',
        eventIds: removed.map((e) => e.id),
      },
    },
    {
      actor: 'claude:manual-sourcing',
      action: 'event_source_deactivated',
      metadata: {
        reason:
          "feedback #136/#139: 'Hawthorne Scholastic Academy PTA' is a different nearby school's own internal PTA calendar (curriculum nights, PTA meetings, field trips, fundraisers, graduation), not Nettelhorst content — deactivated and removed every event it produced",
        sourceId: HAWTHORNE_SOURCE_ID,
        eventIds: hawthorneEvents.map((e) => e.id),
      },
    },
  ])

  console.log(`Soft-deleted ${removed.length} events (expected ${REMOVE_EVENT_IDS.length}).`)
  console.log(`Soft-deleted ${hawthorneEvents.length} Hawthorne Scholastic Academy PTA events and deactivated the source.`)
}

await main()
process.exit(0)
