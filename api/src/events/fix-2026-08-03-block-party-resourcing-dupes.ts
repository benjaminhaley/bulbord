import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Re-running seed-2026-08-01-block-parties.ts (a manual sourcing pass, feedback-driven)
// on 2026-08-03 re-inserted all 17 still-upcoming block parties as duplicates: the
// original rows were retroactively title-simplified to bare "Block Party" by
// backfill-2026-08-02-simplify-titles.ts, but ingestEvents()'s dedup lookup runs
// simplifyTitle() again on each new candidate before checking for an existing row —
// and with no ANTHROPIC_API_KEY set on Railway, that call degrades to "return the
// title unchanged," so the new candidates kept their full "Block Party: X block of Y
// St" title and didn't match the already-simplified existing rows. None of the 17
// duplicates (all created today) had any event_interests, so it's safe to soft-delete
// them and keep the original, older rows.
const DUPLICATE_EVENT_IDS = [
  '57fc67fd-0a1a-4c80-b3b8-1a29585ace6c',
  '50b76e2c-93cd-4455-ba71-0990fb165edf',
  '45af4c4f-9016-423b-bd28-2f1736e70317',
  '1130ce27-238a-44ea-9eee-a4abfa6439ab',
  'ce1cce12-fd93-47b1-b372-7b022013d877',
  '51b4db4e-ff7f-4c7c-a864-4cfbab920a3b',
  'c3c2a889-5453-4ecb-9290-27e7a3e7516e',
  'cb60e38e-05ed-40e8-85fe-18ec9dd8758d',
  'e16b15f0-c0ce-4b3f-af65-f5caf1b73a4c',
  'e99819c5-7cc3-49b1-a864-3c42ac91e187',
  '0752d721-aeb3-4e82-a8d7-0facaf774129',
  'c6c7e8aa-a7d5-4256-b79e-59dcbfd09fa9',
  'cb67cc3a-e880-46b3-887a-7dc911d4dab1',
  '53949166-1f48-4a4e-86fd-12f1964017ca',
  '0e696835-13e9-4dff-8d55-0e6a58e331b2',
  '9a98421a-5b76-4e3c-a5ae-5c0677c3fbd0',
  '6b2cdbc8-0edf-4976-b155-d89049ee6224',
]

async function main() {
  const now = new Date()
  const updated = await db
    .update(events)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(events.id, DUPLICATE_EVENT_IDS))
    .returning({ id: events.id })

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'soft-deleted duplicates created by re-running block-party sourcing without ANTHROPIC_API_KEY set',
      eventIds: updated.map((e) => e.id),
    },
  })

  console.log(`Soft-deleted ${updated.length} duplicate block-party events`)
}

await main()
process.exit(0)
