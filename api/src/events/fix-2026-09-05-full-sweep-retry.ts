import 'dotenv/config'
import { readFileSync } from 'node:fs'

import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Retry pass for the 25 events that came back 'none' on the first sweep
// (fix-2026-09-05-full-sweep-remainder.ts) — a direct spot-check confirmed
// Wikimedia's search/imageinfo/download endpoints were all working fine
// moments later, so the first pass's empty web-search results look like
// transient contention from running concurrency=4 as a follow-on to the
// full-image-sweep audit's own load, not a real "nothing exists" case.
// Lower concurrency this time to reduce the chance of the same contention.
const CONCURRENCY = 2

async function main() {
  const ids = readFileSync('/tmp/still_none_ids.txt', 'utf8').trim().split('\n')
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, sourceUrl: events.sourceUrl })
    .from(events)
    .where(inArray(events.id, ids))

  console.log(`Retrying ${rows.length} events...\n`)

  let index = 0
  let sourced = 0
  let none = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      const { result, trace } = await enrichEventImage(row.id, {
        sourceUrl: row.sourceUrl,
        overrideImageUrl: null,
        title: row.title,
        description: row.description,
      })
      if (result === 'sourced') sourced++
      else none++
      console.log(`${result === 'sourced' ? 'FIXED' : 'STILL NONE'}: "${row.title}" (${row.id})`)
      if (result !== 'sourced') console.log(`  trace: ${JSON.stringify(trace)}`)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

  console.log(`\nDone. ${sourced} re-sourced, ${none} still unresolved out of ${rows.length}.`)
}

await main()
process.exit(0)
