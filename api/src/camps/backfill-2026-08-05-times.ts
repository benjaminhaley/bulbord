import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog } from '../db/schema.js'

// One-off, rerunnable backfill applying the exact hours (and, for ClimbZone,
// the corrected max-time price) researched in the seventh follow-up pass
// documented in seed-2026-08-04-providers.ts's own header comment — see that
// file for the sourcing detail behind each value below. This script updates
// existing camp rows in place (by source name) rather than re-running the
// seed script, which would insert duplicate camps. A hand-verified mapping,
// same convention as events/backfill-2026-08-02-simplify-titles.ts, not a
// live re-derivation — this must match exactly what was researched and
// reviewed, not whatever a fresh lookup happens to produce.
interface SourceUpdate {
  sourceName: string
  startTime: string | null
  endTime: string | null
  pricePerDay?: string | null
  priceDetails?: string | null
}

const UPDATES: SourceUpdate[] = [
  {
    sourceName: 'Lake View YMCA',
    startTime: '07:00',
    endTime: '18:00',
  },
  {
    sourceName: 'ClimbZone Chicago',
    startTime: '09:00',
    endTime: '17:30',
    pricePerDay: '150.00',
    priceDetails:
      'Full day (9:00am-3:30pm): $120/day, $540/week. Add aftercare (3:30-5:30pm) for the full 9:00am-5:30pm day: ' +
      '$150/day total. Morning half-day (9:00am-12:00pm): $70/day, $320/week. Afternoon half-day (12:30pm-3:30pm): ' +
      '$70/day, $320/week. A 5% sibling discount applies to camp fees.',
  },
  {
    sourceName: 'Fit City Kids',
    startTime: '08:00',
    endTime: '18:00',
  },
]

async function main() {
  let totalUpdated = 0
  for (const update of UPDATES) {
    const [source] = await db
      .select({ id: campSources.id })
      .from(campSources)
      .where(and(eq(campSources.name, update.sourceName), isNull(campSources.deletedAt)))
      .limit(1)
    if (!source) {
      console.log(`No camp_sources row found for "${update.sourceName}" — skipping`)
      continue
    }

    const setValues: Partial<typeof camps.$inferInsert> = {
      startTime: update.startTime,
      endTime: update.endTime,
      updatedAt: new Date(),
    }
    if (update.pricePerDay !== undefined) setValues.pricePerDay = update.pricePerDay
    if (update.priceDetails !== undefined) setValues.priceDetails = update.priceDetails

    const updatedRows = await db
      .update(camps)
      .set(setValues)
      .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
      .returning({ id: camps.id })

    console.log(`${update.sourceName}: updated ${updatedRows.length} camp(s)`)
    totalUpdated += updatedRows.length
  }

  await db.insert(eventsLog).values({
    actor: 'claude:camps-times-backfill-2026-08-05',
    action: 'camps_times_backfill',
    metadata: { updatedCount: totalUpdated },
  })

  console.log(`Done. ${totalUpdated} camp(s) updated total.`)
}

await main()
process.exit(0)
