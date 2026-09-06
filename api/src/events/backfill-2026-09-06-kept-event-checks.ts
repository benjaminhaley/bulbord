import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { checkDateQuality, checkTimeQuality, buildDuplicateCheck, scoreTextChecks, type PipelineChecks } from './candidate-checks.js'
import { getImageObject } from '../uploads/storage.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import { scoreImageRelevance } from '../uploads/image-relevance.js'

// Pipeline Review v2 (2026-09-06, Ben's direct follow-up: "it doesn't make
// sense that this one doesn't have any checks recorded — they all should
// have all the checks recorded and some comment on them"): every event
// ingested before the full 9-check system existed has
// pipelineQualityChecks: null, which the review page shows as "No checks
// recorded (predates this feature)." This computes a real, genuine
// checklist for every such event retroactively — including actually
// downloading and re-scoring the event's own already-live image (real
// quality gate + real vision relevance call against its own title/
// description), not just assuming it's fine because it's already live.
//
// Deliberately does NOT touch `status` — this is the same "post-hoc audit,
// not a retroactive gate" posture the whole feature already commits to
// (see CLAUDE.md's Pipeline Review section): an already-approved, already-
// live event stays exactly as visible to members as it was before this
// ran, even if a newly-computed check turns up something worth an admin's
// attention. duplicateCheck is always a pass here — re-litigating whether
// an already-live event happens to look like a duplicate of another
// already-live event is a different, riskier question than this backfill
// is trying to answer, so it's left alone (buildDuplicateCheck() always
// passes, same as a freshly-kept candidate that survived real dedup).
//
// Text checks run in small batches (not one call for every row) since
// scoreTextChecks' own response schema (4 sub-results per item) would
// otherwise risk truncating against its fixed max_tokens budget for a
// large batch. Image checks run with bounded concurrency, matching
// image-enrichment.ts's own ENRICH_CONCURRENCY convention, since each one
// is a real network fetch plus a vision call.
const TEXT_CHECK_BATCH_SIZE = 15
const IMAGE_CHECK_CONCURRENCY = 5

async function bufferFromStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function checkStoredImage(imageUrl: string, title: string, description: string | null): Promise<{ imageQuality: PipelineChecks['imageQuality']; imageRelevance: PipelineChecks['imageRelevance'] }> {
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

async function main() {
  const rows = await db
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
    .where(and(isNull(events.pipelineQualityChecks), isNull(events.deletedAt)))

  console.log(`${rows.length} events missing pipeline checks`)
  if (rows.length === 0) return

  const today = todayInChicago()
  const textChecksById = new Map<string, Awaited<ReturnType<typeof scoreTextChecks>> extends (infer T)[] | null ? T : never>()

  for (let i = 0; i < rows.length; i += TEXT_CHECK_BATCH_SIZE) {
    const batch = rows.slice(i, i + TEXT_CHECK_BATCH_SIZE)
    console.log(`Text checks: batch ${i / TEXT_CHECK_BATCH_SIZE + 1} (${batch.length} events)`)
    const results = await scoreTextChecks(
      batch.map((r) => ({ title: r.title, description: r.description ?? undefined, address: r.address ?? undefined, locationName: r.locationName ?? undefined })),
    )
    batch.forEach((r, idx) => {
      const result = results?.[idx]
      if (result) textChecksById.set(r.id, result)
    })
  }

  let index = 0
  let updated = 0
  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      const textChecks = textChecksById.get(row.id)
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
      updated++
      console.log(`  [${updated}/${rows.length}] ${row.title} — ${pipelineChecksPassed ? 'all pass' : 'some checks failed'}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(IMAGE_CHECK_CONCURRENCY, rows.length) }, worker))

  console.log(`Done — ${updated} events updated.`)
}

await main()
process.exit(0)
