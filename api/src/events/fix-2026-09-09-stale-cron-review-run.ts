import 'dotenv/config'
import { eq, isNull, inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog, rejectedEventCandidates } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { checkDateQuality, checkTimeQuality, buildDuplicateCheck, scoreTextChecks, type PipelineChecks } from './candidate-checks.js'
import { getImageObject } from '../uploads/storage.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { scoreImageRelevance } from '../uploads/image-relevance.js'
import type { CandidateEvent } from './ingest.js'

// Feedback, 2026-09-09 ("pipe interview email" screenshots — Ben's Wed Sep 9
// digest linked to a Pipeline Review page showing zero items everywhere, and
// "See previous runs" rendered a blank white page): the `event-sourcing-cron`
// Railway service hadn't been redeployed since 2026-09-06T01:11Z — three
// commits behind (9c55fbd, 3a4725b, and everything since) that landed the
// same day, ~16-18 hours later. Its Sep 9 07:03am CT run therefore:
//
//   1. Never wrote `metadata.startedAt` on its `event_sourcing_run` summary
//      log row (that field was added by 3a4725b) — getLatestEventSourcingRun()
//      fell back to the log row's own createdAt (essentially the run's END
//      time, written after every source finished), so
//      getPipelineReviewCandidatesSince() filtered out literally everything
//      the run had just inserted moments earlier. This is why the default
//      "latest run" view showed 0/0/0.
//   2. Computed checks using the OLD, pre-9c55fbd 3-key shape
//      ({titleQuality, locationQuality, descriptionQuality}) for the 2 kept
//      events, and no checks at all for the 12 rejected candidates (that
//      code path didn't exist yet on the deployed build) — so
//      ChecksSection/CheckLine's `checks[key].pass` crashed on a missing key
//      the moment "See previous runs" (scope=all) tried to render them,
//      producing the blank white screen (no error boundary catches it).
//
// This backfills exactly this run's affected rows to the current, real
// 9-check shape (same technique as backfill-2026-09-06-kept-event-checks.ts
// / backfill-2026-09-06-rejected-candidate-checks.ts) and repairs the log
// row's startedAt so both the page's default view and the *already-sent*
// email's "Review this run" link work correctly with no new email needed.
// event-sourcing-cron itself was separately redeployed with current code so
// future runs don't repeat this.
const RUN_LOG_ID = '96841a39-02a6-4e98-bd51-ae5a2b4a2b63'
// Earliest real activity from this run was 12:02:21.308Z (first rejected
// candidate insert) — this predates that by a clean margin with no risk of
// bleeding into the prior (2026-09-06) run's own rows.
const RUN_STARTED_AT = new Date('2026-09-09T12:02:00.000Z')

const KEPT_EVENT_IDS = ['b10b5daa-465a-49f9-99fc-b577f8e9b59c', 'adaa63d0-e30f-4857-ad4b-e7c414bb8239']

async function bufferFromStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function checkStoredImage(imageUrl: string, title: string, description: string | null) {
  const key = imageUrl.replace(/^\/uploads\//, '')
  try {
    const object = await getImageObject(key)
    if (!object) {
      return {
        imageQuality: { pass: false, reason: 'Stored image object could not be found in the bucket', attempts: 1 },
        imageRelevance: { pass: false, reason: 'No image to score — object missing', attempts: 1 },
      }
    }
    const buffer = await bufferFromStream(object.body)
    const isLowQuality = await isLowQualityImage(buffer)
    const imageQuality: PipelineChecks['imageQuality'] = isLowQuality
      ? { pass: false, reason: 'Fails the size/aspect-ratio check on re-verification', attempts: 1 }
      : { pass: true, reason: 'Passes the size/aspect-ratio check on re-verification', attempts: 1 }

    const relevance = await scoreImageRelevance(buffer, { title, description })
    const imageRelevance: PipelineChecks['imageRelevance'] = {
      pass: relevance.keep,
      reason: relevance.reason ?? (relevance.keep ? 'Assumed relevant (no API key or scoring unavailable)' : 'Not judged to match this event'),
      attempts: 1,
    }
    return { imageQuality, imageRelevance }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    return {
      imageQuality: { pass: false, reason: `Could not re-verify — ${reason}`, attempts: 1 },
      imageRelevance: { pass: false, reason: 'Not scored — the re-verification itself errored', attempts: 1 },
    }
  }
}

async function fixKeptEvents() {
  const targets = await db
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      address: events.address,
      locationName: events.locationName,
      startDate: events.startDate,
      startTime: events.startTime,
      allDay: events.allDay,
      imageUrl: events.imageUrl,
    })
    .from(events)
    .where(inArray(events.id, KEPT_EVENT_IDS))
  console.log(`Recomputing checks for ${targets.length} kept event(s)`)

  const today = todayInChicago()
  const textResults = await scoreTextChecks(
    targets.map((r) => ({ title: r.title, description: r.description ?? undefined, address: r.address ?? undefined, locationName: r.locationName ?? undefined })),
  )

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]
    const textChecks = textResults?.[i]
    const { imageQuality, imageRelevance } = await checkStoredImage(row.imageUrl, row.title, row.description)
    const checks: PipelineChecks = {
      titleQuality: textChecks?.titleQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      descriptionQuality: textChecks?.descriptionQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      locationLabelQuality: textChecks?.locationLabelQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      addressQuality: textChecks?.addressQuality ?? { pass: true, reason: 'Not checked', attempts: 1 },
      dateQuality: checkDateQuality(row.startDate, today),
      timeQuality: checkTimeQuality(row.startTime ?? undefined, row.allDay),
      imageQuality,
      imageRelevance,
      duplicateCheck: buildDuplicateCheck(),
    }
    const pipelineChecksPassed = Object.values(checks).every((c) => c.pass)
    await db.update(events).set({ pipelineQualityChecks: checks, pipelineChecksPassed, updatedAt: new Date() }).where(eq(events.id, row.id))
    console.log(`  ${row.title} — ${pipelineChecksPassed ? 'all pass' : 'some checks failed'}`)
  }
}

async function fixRejectedCandidates() {
  const rows = await db
    .select({
      id: rejectedEventCandidates.id,
      title: rejectedEventCandidates.title,
      candidateData: rejectedEventCandidates.candidateData,
      rejectionType: rejectedEventCandidates.rejectionType,
      rejectionReason: rejectedEventCandidates.rejectionReason,
      createdAt: rejectedEventCandidates.createdAt,
    })
    .from(rejectedEventCandidates)
    .where(isNull(rejectedEventCandidates.checks))
  // Scoped to this incident's run only — a null-checks row from any other
  // (already-resolved-by-a-different-backfill) time would be unexpected, but
  // this guard keeps the script honest about what it's actually fixing.
  const targets = rows.filter((r) => r.createdAt >= RUN_STARTED_AT)
  console.log(`Recomputing checks for ${targets.length} rejected candidate(s) from this run`)

  const today = todayInChicago()
  const textResults = await scoreTextChecks(
    targets.map((r) => {
      const c = r.candidateData as CandidateEvent
      return { title: r.title, description: c.description, address: c.address, locationName: c.locationName }
    }),
  )

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]
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
    console.log(`  ${row.title}`)
  }
}

async function fixRunLogStartedAt() {
  const [row] = await db.select({ metadata: eventsLog.metadata }).from(eventsLog).where(eq(eventsLog.id, RUN_LOG_ID)).limit(1)
  if (!row) {
    console.log('Run log row not found — skipping startedAt backfill')
    return
  }
  const metadata = row.metadata as Record<string, unknown>
  await db
    .update(eventsLog)
    .set({ metadata: { ...metadata, startedAt: RUN_STARTED_AT.toISOString() } })
    .where(eq(eventsLog.id, RUN_LOG_ID))
  console.log(`Backfilled startedAt=${RUN_STARTED_AT.toISOString()} on run log ${RUN_LOG_ID}`)
}

async function main() {
  await fixKeptEvents()
  await fixRejectedCandidates()
  await fixRunLogStartedAt()
  console.log('Done.')
}

await main()
process.exit(0)
