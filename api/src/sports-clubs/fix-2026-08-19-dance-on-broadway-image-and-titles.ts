import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubs, sportsClubSources } from '../db/schema.js'

// Two real regressions found live, from a screenshot, right after
// backfill-2026-08-19-split-dance-on-broadway-classes.ts shipped:
//
// 1. Every one of the 62 split-out class listings got a generated
//    placeholder image (a green "D" initial card) instead of the studio's
//    real logo. Root cause: that script's `existing = db.select(...).from
//    (sportsClubs).where(eq(sportsClubs.sourceId, source.id))` had no
//    deleted_at filter and no ORDER BY, so `existing[0]` wasn't
//    guaranteed to be one of the 16 real per-level rows — it silently
//    picked up the original, long-since-soft-deleted bare "Dance on
//    Broadway" listing from the very first (wrong-domain) research pass,
//    which had a placeholder image, not the real one. The real logo
//    survived untouched on the one row this rebuild never touched —
//    "Dance on Broadway — Team Training" — so it's used as the known-good
//    source here instead of re-fetching.
//
// 2. Titles ("Dance on Broadway — Jazz 1 (Fri, 4pm)") were too long and
//    doubly redundant (feedback, 2026-08-19): the venue is already the
//    location line below the title, and the day/time is already its own
//    line right under the title too. Titles are now just the class name
//    itself (e.g. "Jazz 1"), matching Camps' own "titles are just the
//    differentiating fact" convention. Sibling sections that share a
//    class name (e.g. three "Lovebug Combo" rows on different days) are
//    now only distinguished by their own date/time line, not their title
//    — a deliberate simplification per this exact request, not an
//    oversight.
const REAL_IMAGE_URL = '/uploads/sportsclubs/691824d1-45cb-4608-ba21-0ae0cd45f40b.jpeg'
const REAL_THUMBNAIL_URL = '/uploads/sportsclubs/691824d1-45cb-4608-ba21-0ae0cd45f40b-thumb.jpg'
const PLACEHOLDER_IMAGE_URL = '/uploads/sportsclubs/be5dde0a-bef0-45c1-803b-cc77abe498c4.png'

// "Dance on Broadway — <class name> (<Day>, <time>)" -> "<class name>",
// also matching the rare "... #2" dedup suffix the original script could
// append after the closing paren for two sections that happened to share
// the exact same class name/day/time.
const TITLE_PATTERN = /^Dance on Broadway — (.+?) \([A-Za-z]{3}, [\d:apm]+\)(?: #\d+)?$/

async function main() {
  const [source] = await db.select({ id: sportsClubSources.id }).from(sportsClubSources).where(eq(sportsClubSources.name, 'Dance on Broadway'))
  if (!source) throw new Error('Dance on Broadway source row not found')

  const rows = await db
    .select({ id: sportsClubs.id, title: sportsClubs.title, imageUrl: sportsClubs.imageUrl })
    .from(sportsClubs)
    .where(eq(sportsClubs.sourceId, source.id))

  let imageFixed = 0
  let titleFixed = 0

  for (const row of rows) {
    const updates: { imageUrl?: string; thumbnailUrl?: string; title?: string } = {}

    if (row.imageUrl === PLACEHOLDER_IMAGE_URL) {
      updates.imageUrl = REAL_IMAGE_URL
      updates.thumbnailUrl = REAL_THUMBNAIL_URL
      imageFixed++
    }

    const match = row.title.match(TITLE_PATTERN)
    if (match) {
      updates.title = match[1]
      titleFixed++
    }

    if (Object.keys(updates).length > 0) {
      await db.update(sportsClubs).set(updates).where(eq(sportsClubs.id, row.id))
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:fix-2026-08-19-dance-on-broadway-image-and-titles',
    action: 'sports_club_created',
    metadata: { imageFixed, titleFixed, note: 'Fixed placeholder-image regression and shortened titles to just the class name' },
  })

  console.log(`Fixed ${imageFixed} image(s) and ${titleFixed} title(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
