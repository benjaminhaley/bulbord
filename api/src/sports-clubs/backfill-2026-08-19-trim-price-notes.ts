import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubs } from '../db/schema.js'

// Feedback #109 (2026-08-19): "this explanation here of how you arrived at
// that number is extraneous and unnecessary. Please remove it and all other
// examples like this of your process. We just want the final result." The
// fix isn't to stop showing price_note at all (SportsClubDetailPage.tsx
// still renders it — it's a legitimate spot for a real, short end-user fact
// like a sibling discount or an early-bird window) but to strip every
// instance that reads as a narration of *how a number was researched*
// ("Confirmed via the studio's Mindbody store for...", "Confirmed directly
// on i9's own venue page via a real browser render...") rather than
// something a member actually needs. Trimmed to just the useful fact where
// one exists; set null where the whole note was process narrative with
// nothing else in it.
async function main() {
  const updates: { title: string; priceNote: string | null }[] = [
    // Pure process narrative, no independent fact — the caveat about the
    // season not being published yet is already covered by cadenceNote.
    { title: 'Chicago Park District — T-ball', priceNote: null },
    // The per-class session-count/price breakdown this note restated is now
    // fully visible in the Options table itself (see optionPriceCell's new
    // weekly+total format) — nothing left to say here.
    { title: 'Dovetail Studios', priceNote: null },
    {
      title: 'i9 Sports — Flag Football',
      priceNote: 'Early-bird rate if paid by 08/08/2026; the standard rate afterward may be slightly higher.',
    },
    {
      title: 'i9 Sports — Soccer',
      priceNote: 'Early-bird rate if paid by 08/08/2026; the standard rate afterward may be slightly higher.',
    },
    {
      title: 'i9 Sports — T-ball & Baseball',
      priceNote: 'Early-bird rate if paid by 08/08/2026; the standard rate afterward may be slightly higher.',
    },
    {
      title: 'Supreme Jiu Jitsu — Bully Proof Kids BJJ',
      priceNote: 'Typical range reported elsewhere: $100–204/month.',
    },
  ]

  let updated = 0
  for (const u of updates) {
    const result = await db
      .update(sportsClubs)
      .set({ priceNote: u.priceNote })
      .where(eq(sportsClubs.title, u.title))
      .returning({ id: sportsClubs.id })
    if (result.length === 0) console.warn(`No row found for "${u.title}"`)
    updated += result.length
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-19-trim-price-notes',
    action: 'sports_club_created',
    metadata: { note: 'Trimmed price_note text to end-user facts, dropping "how I researched this" narration (feedback #109)', updated },
  })

  console.log(`Updated ${updated} row(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
