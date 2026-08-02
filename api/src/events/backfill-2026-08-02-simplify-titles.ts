import 'dotenv/config'
import { eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// One-off, rerunnable backfill applying the specific title simplifications
// reviewed and approved with Ben on 2026-08-02 (feedback: long titles read
// poorly at large zoom/text sizes). Uses an explicit, hand-verified mapping
// rather than a live call to title-normalization.ts's simplifyTitle() — that
// function is for *future* ingested events; this script's output was shown
// to Ben as a diff before writing, so it must match exactly what he saw,
// not whatever a fresh LLM call happens to produce.
function simplifyExisting(title: string, locationName: string | null): string | null {
  const movieNight = title.match(/^Toyota Movie Nights at .+: (.+)$/)
  if (movieNight) return `Movie Night: ${movieNight[1]}`

  const blockParty = title.match(/^Block Party: (.+)$/)
  if (blockParty && locationName === blockParty[1]) return 'Block Party'

  if (title === 'Southport Neighbors Quarterly Community Meeting') return 'Southport Neighbors Meeting'
  if (title === 'Southport Neighbors Neighborhood Yard Sale') return 'Southport Neighbors Yard Sale'
  if (title === 'Green City Market — Lincoln Park' && locationName === title) return 'Green City Market'

  return null
}

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, locationName: events.locationName })
    .from(events)
    .where(isNull(events.deletedAt))

  let updated = 0
  for (const row of rows) {
    const simplified = simplifyExisting(row.title, row.locationName)
    if (!simplified) continue

    await db.update(events).set({ title: simplified, updatedAt: new Date() }).where(eq(events.id, row.id))
    console.log(`${row.title} -> ${simplified}`)
    updated++
  }

  await db.insert(eventsLog).values({
    actor: 'claude:title-backfill-2026-08-02',
    action: 'events_title_backfill',
    metadata: { candidateCount: rows.length, updated },
  })

  console.log(`${rows.length} event(s) checked, ${updated} title(s) simplified.`)
}

await main()
process.exit(0)
