import 'dotenv/config'
import { eq, isNull, and } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { buildDuplicateCheck, checkDateQuality, checkTimeQuality, runTextChecksWithRetry, type PipelineChecks } from './candidate-checks.js'
import { scoreStoredEventImage } from './image-enrichment.js'
import { fetchPageText } from './resourcing.js'

// Feedback #163 ("if any events have been added in the last week via
// description upload or manual entry, but have not yet gone through
// official pipeline review please include these"): POST /events now
// computes the full 9-check suite for every future member post (see
// events/routes.ts), but that's forward-only — this is the one-time catch-
// up for whatever already existed. In practice only one row in the whole
// table qualified (most member-submitted events already had checks from
// the 2026-09-06 backfill, which — unlike Pipeline Review's own query —
// was never actually scoped to system-sourced rows only).
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
      sourceUrl: events.sourceUrl,
      imageUrl: events.imageUrl,
    })
    .from(events)
    .where(and(isNull(events.deletedAt), isNull(events.pipelineQualityChecks)))

  console.log(`${rows.length} event(s) missing pipeline checks`)
  const today = todayInChicago()

  for (const row of rows) {
    const description = row.description ?? undefined
    const locationName = row.locationName ?? undefined
    const sourceText = row.sourceUrl ? (await fetchPageText(row.sourceUrl)) ?? undefined : undefined
    const [{ checks: textChecks }] = await runTextChecksWithRetry(
      [{ title: row.title, description, address: row.address ?? undefined, locationName }],
      sourceText,
    )
    const { imageQuality, imageRelevance } = await scoreStoredEventImage(row.imageUrl, row.title, row.description)
    const checks: PipelineChecks = {
      ...textChecks,
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

  console.log('Done.')
}

await main()
process.exit(0)
