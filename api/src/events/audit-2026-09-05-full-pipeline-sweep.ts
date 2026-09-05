import 'dotenv/config'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { filterFamilyRelevantCandidates } from './candidate-validation.js'
import type { CandidateEvent } from './ingest.js'

// Direct follow-up to "I hope you checked all the events with the new
// pipeline to prove that it worked" — the earlier SQL keyword audit
// (fix-2026-09-05-broader-vague-location-audit.ts) only caught what its own
// hand-picked keywords anticipated (crawl, 18+, grown-up, a fixed list of
// neighborhood names). This instead runs the REAL second-pass validator
// (candidate-validation.ts's filterFamilyRelevantCandidates(), the exact
// function every future sourcing run now calls) against every currently
// live, approved event's real title/description/address/location_name —
// a genuine proof, not an inference from keyword guesses. Read-only: reports
// findings for review, does not delete anything on its own (a flagged event
// still needs the same real-source verification every other removal in this
// file's history has gotten, in case of a false positive).
const BATCH_SIZE = 40

function toCandidate(e: { title: string; description: string | null; address: string | null; locationName: string | null }): CandidateEvent {
  return {
    title: e.title,
    description: e.description ?? undefined,
    startDate: '2099-01-01',
    allDay: true,
    address: e.address ?? undefined,
    locationName: e.locationName ?? undefined,
    sourceUrl: 'audit',
    status: 'approved',
  }
}

async function main() {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      address: events.address,
      locationName: events.locationName,
    })
    .from(events)
    .where(and(isNull(events.deletedAt), eq(events.status, 'approved')))

  console.log(`Auditing ${rows.length} live approved events against the real second-pass validator...\n`)

  let totalRejected = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { rejected } = await filterFamilyRelevantCandidates(batch.map(toCandidate))
    for (const r of rejected) {
      const match = batch.find((b) => b.title === r.title)
      totalRejected++
      console.log(`FLAGGED: "${r.title}" (id: ${match?.id ?? 'unmatched'}) — ${r.reason}`)
      console.log(`  address: ${match?.address ?? 'null'} | location_name: ${match?.locationName ?? 'null'}`)
    }
  }

  console.log(`\nDone. ${totalRejected} of ${rows.length} flagged by the real second-pass validator.`)
}

await main()
process.exit(0)
