import 'dotenv/config'
import { eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { rejectedEventCandidates } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { checkDateQuality, checkTimeQuality, scoreTextChecks, type PipelineChecks } from './candidate-checks.js'
import type { CandidateEvent } from './ingest.js'

// Pipeline Review v2 (2026-09-06, Ben's direct follow-up: "it doesn't make
// sense that this one doesn't have any checks recorded — they all should
// have all the checks recorded and some comment on them"): every rejected
// candidate inserted before ingest.ts started computing checks at rejection
// time has `checks: null`, which the review page shows as "No checks
// recorded (predates this feature)" — an honest but unsatisfying answer per
// Ben's own bar. This runs the exact same checklist ingest.ts now computes
// for a fresh rejection, retroactively, for every existing row missing it.
// Same posture as that code: no retry (a rejected candidate was never going
// to be published), image checks are always the not-attempted sentinel
// (attempts: 0) since none of these ever got a real image search, and
// duplicateCheck states the row's own already-known rejection reason rather
// than re-running dedup against today's live table (which could disagree
// with the original, now-historical decision).
async function main() {
  const rows = await db
    .select({
      id: rejectedEventCandidates.id,
      title: rejectedEventCandidates.title,
      candidateData: rejectedEventCandidates.candidateData,
      rejectionType: rejectedEventCandidates.rejectionType,
      rejectionReason: rejectedEventCandidates.rejectionReason,
    })
    .from(rejectedEventCandidates)
    .where(isNull(rejectedEventCandidates.checks))

  console.log(`${rows.length} rejected candidates missing checks`)
  if (rows.length === 0) return

  const today = todayInChicago()
  const textResults = await scoreTextChecks(
    rows.map((r) => {
      const c = r.candidateData as CandidateEvent
      return { title: r.title, description: c.description, address: c.address, locationName: c.locationName }
    }),
  )

  let updated = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const candidate = row.candidateData as CandidateEvent
    const textChecks = textResults?.[i]
    const notAttempted = { pass: true, reason: 'Not attempted — rejected before an image search', attempts: 0 }
    const checks: PipelineChecks = {
      titleQuality: textChecks?.titleQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      descriptionQuality: textChecks?.descriptionQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      locationLabelQuality: textChecks?.locationLabelQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      addressQuality: textChecks?.addressQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      dateQuality: checkDateQuality(candidate.startDate, today),
      timeQuality: checkTimeQuality(candidate.startTime, candidate.allDay),
      imageQuality: notAttempted,
      imageRelevance: notAttempted,
      duplicateCheck:
        row.rejectionType === 'duplicate'
          ? { pass: false, reason: row.rejectionReason, attempts: 1 }
          : { pass: true, reason: 'Not checked — rejected for relevance before reaching the duplicate check', attempts: 1 },
    }
    await db.update(rejectedEventCandidates).set({ checks, updatedAt: new Date() }).where(eq(rejectedEventCandidates.id, row.id))
    updated++
    console.log(`  [${updated}/${rows.length}] ${row.title}`)
  }

  console.log(`Done — ${updated} rows updated.`)
}

await main()
process.exit(0)
