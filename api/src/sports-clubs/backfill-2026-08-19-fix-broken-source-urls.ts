import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { sportsClubs, sportsClubSources } from '../db/schema.js'

// Feedback (2026-08-19): a broader audit pass across every other
// sports-clubs source (prompted directly by the Dance on Broadway domain
// mistake — see backfill-2026-08-19-dance-on-broadway-rebuild.ts) found two
// more sources pointing at a URL that no longer reaches the real business:
//
// 1. Tutu School (Roscoe Village): the original `/roscoevillage` URL slug
//    404s — the site's own URL structure changed to `/roscoe/` at some
//    point after the original research pass. The business itself is real
//    and unchanged (confirmed via WebSearch + a fresh fetch of the new
//    URL) — the $112/mo price and age range already in the seed data are
//    still exactly correct, only the link was stale.
// 2. The Music Playhouse (Sheil Park): `themusicplayhouse.com` has been
//    compromised/hijacked — it now serves Indonesian-language online
//    gambling content, not the music school. The real business is at
//    `themusicplayhouseofchicago.com` (a different domain entirely,
//    confirmed via WebSearch). The $250/10-week-semester price and address
//    already in the seed data are still correct — this was a domain-level
//    hijack of the OLD url, unrelated to the studio's own real pricing.
const FIXES: { title: string; sourceName: string; newUrl: string; newSourceUrl: string; newNotes: string }[] = [
  {
    title: 'Tutu School',
    sourceName: 'Tutu School (Roscoe Village)',
    newUrl: 'https://tutuschool.com/roscoe/',
    newSourceUrl: 'https://tutuschool.com/roscoe/classes/',
    newNotes:
      "Real, confirmed rolling/always-open enrollment for ages 6mo-8yr, real published monthly membership rate ($112/mo, billed the 1st of each month) — reconfirmed 2026-08-19. URL corrected: the original /roscoevillage slug 404s now; the site restructured to /roscoe/ at some point after the original 2026-08-18 research pass. Exact single-class time slot within their published weekly operating windows still not isolated.",
  },
  {
    title: 'The Music Playhouse — The Music Class',
    sourceName: 'The Music Playhouse (Sheil Park)',
    newUrl: 'https://www.themusicplayhouseofchicago.com/',
    newSourceUrl: 'https://www.themusicplayhouseofchicago.com/programs.html',
    newNotes:
      "URL corrected 2026-08-19: themusicplayhouse.com (the original source URL) has been compromised/hijacked and now serves unrelated Indonesian-language gambling content, not the music school — a domain-level takeover of the old URL, unrelated to the studio's own real operations. The real site is themusicplayhouseofchicago.com (confirmed via WebSearch, cross-referenced against the studio's own Sawyer marketplace listing). Real semester dates (Fall 2026: Sept 14-Nov 20) and real published price ($250/10-week semester, $200 siblings, $28/class drop-in) reconfirmed unchanged. Exact weekly day/time still not published; Sawyer's own marketplace page 403'd a direct fetch too.",
  },
]

async function main() {
  for (const fix of FIXES) {
    const sourceResult = await db
      .update(sportsClubSources)
      .set({ url: fix.newUrl, notes: fix.newNotes })
      .where(eq(sportsClubSources.name, fix.sourceName))
      .returning({ id: sportsClubSources.id })
    const clubResult = await db
      .update(sportsClubs)
      .set({ sourceUrl: fix.newSourceUrl })
      .where(eq(sportsClubs.title, fix.title))
      .returning({ id: sportsClubs.id })
    console.log(`${fix.sourceName}: ${sourceResult.length} source row(s), ${clubResult.length} club row(s) updated`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
