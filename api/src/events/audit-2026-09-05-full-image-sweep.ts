import 'dotenv/config'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { fetchExternalImage } from '../uploads/fetch-external-image.js'
import { scoreImageRelevance } from '../uploads/image-relevance.js'

// Companion to audit-2026-09-05-full-pipeline-sweep.ts, for the image half
// of "the new pipeline" — direct follow-up to being asked whether every
// existing event was actually checked with the new scoreImageRelevance()
// step, not just the 2 images touched during the #158 fix. Downloads each
// live approved event's CURRENT already-hosted image (via the public
// /uploads/* proxy, same bytes a real member would see) and scores it
// against that event's own title/description with the real function every
// future enrichment run now calls. Read-only: reports mismatches for
// review, does not replace anything automatically — a flagged image still
// needs the same real-photo research every other image fix in this file's
// history has gotten, since the scorer can itself be wrong.
const API_BASE = 'https://api-production-a551.up.railway.app'
const CONCURRENCY = 5

async function main() {
  const rows = await db
    .select({ id: events.id, title: events.title, description: events.description, imageUrl: events.imageUrl })
    .from(events)
    .where(and(isNull(events.deletedAt), eq(events.status, 'approved')))

  console.log(`Auditing ${rows.length} live approved events' current images against the real scorer...\n`)

  let index = 0
  let flagged = 0
  let errored = 0

  async function worker() {
    while (index < rows.length) {
      const row = rows[index++]
      try {
        const buffer = await fetchExternalImage(`${API_BASE}${row.imageUrl}`)
        if (!buffer) {
          console.log(`DOWNLOAD FAILED: "${row.title}" (id: ${row.id}) — ${row.imageUrl}`)
          errored++
          continue
        }
        const score = await scoreImageRelevance(buffer, { title: row.title, description: row.description })
        if (!score.keep) {
          flagged++
          console.log(`FLAGGED: "${row.title}" (id: ${row.id}) — ${score.reason}`)
          console.log(`  image: ${API_BASE}${row.imageUrl}`)
        }
      } catch (err) {
        errored++
        console.log(`ERROR: "${row.title}" (id: ${row.id}) — ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

  console.log(`\nDone. ${flagged} flagged, ${errored} errored, out of ${rows.length}.`)
}

await main()
process.exit(0)
