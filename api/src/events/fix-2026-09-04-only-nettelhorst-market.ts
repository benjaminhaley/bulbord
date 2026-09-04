import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources, events, eventsLog } from '../db/schema.js'

// Feedback #144 (2026-09-04), "please only list the Nettelhorst market of all
// the markets": Ben's own reasoning — "the others are really centers for
// different communities" — the Nettelhorst French Market (held at the school
// itself) is the one recurring farmers/artisan market actually affiliated
// with the Nettelhorst community; Green City Market (Lincoln Park), Low-Line
// Market at Southport, and Roscoe Village Farmers Market each serve a
// different neighborhood's own community. See extraction-filters.ts's new
// rule for the going-forward version of this same judgment call.
//
// Deliberately NOT touched: Northalsted Market Days, Wrigleyville Night
// Market, and Saint Andrew Parish Oktoberfest & Fall Market — these are
// one-time/annual street festivals with a market/vendor component, not a
// recurring neighborhood farmers market competing with Nettelhorst's own
// (same distinction the new extraction rule draws).

const REMOVE_EVENT_IDS = [
  // --- Green City Market (Lincoln Park) ---
  '8e150c8d-7273-4406-9aa8-9c13c3dd1e0a',
  '5cc9bd21-7437-433d-9a05-aadcc616fadb',
  '095a31a9-674a-4f75-a064-860c9238616a',
  'c4874ff2-d40e-415d-b97f-53570a48d30c',
  '6718a1cd-9654-4cbe-811b-511ccbda7b99',
  'f4def8cf-7c0e-48d8-a040-13da714df333',
  'cecdd289-0226-4fd6-8f52-194235686cdf',
  'ea7bff9f-2786-4067-b997-ef8ff08ed49b',
  '59f8b3c3-f7f3-4f19-9f1d-7dac348563e5',
  '585cbe29-b34b-4a5d-a2dc-a564a7105a0b',
  '71f07eea-34ea-497a-b049-08b6b03f202d',
  // --- Low-Line Market at Southport ---
  'b772cb85-6268-400c-bc1d-7bd021cc9d07',
  'de102466-32cd-4009-806d-e5da5367a44c',
  '40899721-d57e-4e9b-9cbb-e29c04b12492',
  'd0e82653-5778-40df-92e9-331cdb16bad3',
  '64d7d887-71b3-4c55-8ff1-06cdde4660dd',
  '75a0644b-63bd-484d-af6c-31defef32689',
  '6c7dde82-f9c9-4ec0-b1f9-c6109f1b6599',
  '08bb78b9-434a-4ddd-ad80-20f191ac5e4a',
  '992238b1-6393-4b0d-8464-2de335404bbc',
  // --- Roscoe Village Farmers Market (generic Lakeview Roscoe Village Chamber calendar) ---
  'ab8ee2a3-3524-4e29-b735-654c41d09cfb',
  '9e353be2-bc32-4434-b2af-eb878763c4b3',
  '2e973401-f15a-4510-bbea-cca89ecbad55',
  '4e77e296-b029-46b1-863e-2a40002a54c5',
]

// Green City Market and Low-Line Market at Southport each have their own
// dedicated event_sources row (no other content ever comes from either), so
// deactivating them outright — rather than relying on the extraction rule to
// zero them out on every future re-scrape — is the cleaner, cheaper fix: no
// wasted weekly LLM call against a source that will always be filtered to
// nothing. Roscoe Village Farmers Market has no equivalent dedicated source
// to deactivate (it's one listing among several on the generic Lakeview
// Roscoe Village Chamber calendar), so it relies on the new
// extraction-filters.ts rule to stay excluded going forward.
async function main() {
  const now = new Date()

  const removed = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, REMOVE_EVENT_IDS))
    .returning({ id: events.id, title: events.title })

  const dedicatedSources = await db
    .select({ id: eventSources.id, name: eventSources.name })
    .from(eventSources)
    .where(inArray(eventSources.name, ['Green City Market — Lincoln Park', 'Low-Line Market at Southport']))

  for (const source of dedicatedSources) {
    await db.update(eventSources).set({ isActive: false, updatedAt: now }).where(eq(eventSources.id, source.id))
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        "feedback #144: only the Nettelhorst French Market is Nettelhorst-affiliated — removed Green City Market, Low-Line Market at Southport, and Roscoe Village Farmers Market, and deactivated the two dedicated market sources",
      eventIds: removed.map((e) => e.id),
      deactivatedSourceIds: dedicatedSources.map((s) => s.id),
    },
  })

  console.log(`Soft-deleted ${removed.length} events (expected ${REMOVE_EVENT_IDS.length}).`)
  console.log(`Deactivated sources: ${dedicatedSources.map((s) => s.name).join(', ')}`)
}

await main()
process.exit(0)
