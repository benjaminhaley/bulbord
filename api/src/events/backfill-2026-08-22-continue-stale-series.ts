import 'dotenv/config'
import { and, eq, isNull, like } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'
import { lookupMoviePoster } from './movie-poster-lookup.js'

// Direct follow-up to the recurring-series-health detector shipped the same
// day (feedback #119) — the very first live check against production found
// three real stale series it wasn't built to fix on its own: Music Box's
// Indoor Kids matinees (each film gets its own title, so the detector
// flagged "Indoor Kids: Hercules"/"Indoor Kids: Jason and the Argonauts"
// individually rather than the series as a whole — a known shape of that
// grouping choice, still the right signal: it means the underlying series
// hasn't had a new film added recently) and Peggy Notebaert's "Casting on
// the Pier". Both sources already have their own dedicated event_sources
// rows (not the retired generic bucket), so this is pure continuation, no
// re-filing needed.
const MUSIC_BOX_SOURCE_ID = 'b9d00d30-a921-4c39-a125-05fc40121c9a'
const PEGGY_NOTEBAERT_SOURCE_ID = 'ad5ab9b9-8532-415d-860f-f7d35cd2329b'

const MUSIC_BOX_ADDRESS = '3733 N Southport Ave, Chicago, IL 60613'
const PEGGY_NOTEBAERT_ADDRESS = '2430 N Cannon Dr, Chicago, IL 60614'

// Confirmed live 2026-08-22 via musicboxtheatre.com/series-and-festivals/
// indoor-kids-family-friendly-matinees's own "Upcoming showtimes" list — a
// Sucuri WAF issues a 307 to a plain fetch, so this needed a real headless
// browser (Playwright), same technique already established for other
// bot-protected/JS-rendered sources in this codebase. "The Secret World of
// Arrietty" (Aug 29-30) was already correctly seeded by an earlier pass and
// is deliberately not repeated here — ingestEvents would just skip it as a
// dupe either way, but there's no reason to re-list it.
const musicBoxFilms: { title: string; slug: string; dates: [string, string] }[] = [
  { title: 'Harry and the Hendersons', slug: 'harry-and-the-hendersons', dates: ['2026-09-05', '2026-09-06'] },
  { title: 'Beethoven', slug: 'beethoven', dates: ['2026-09-12', '2026-09-13'] },
  { title: "Pete's Dragon", slug: 'petes-dragon', dates: ['2026-09-26', '2026-09-27'] },
]

async function main() {
  const musicBoxCandidates: CandidateEvent[] = []
  for (const film of musicBoxFilms) {
    const posterUrl = await lookupMoviePoster(film.title)
    for (const startDate of film.dates) {
      musicBoxCandidates.push({
        title: `Indoor Kids: ${film.title}`,
        description: `Family-friendly matinee series at Music Box Theatre. ${film.title}.`,
        startDate,
        startTime: '11:00',
        allDay: false,
        address: MUSIC_BOX_ADDRESS,
        locationName: 'Music Box Theatre',
        sourceUrl: `https://musicboxtheatre.com/films-and-events/${film.slug}`,
        imageUrl: posterUrl ?? undefined,
        status: 'approved',
      })
    }
  }
  console.log('Indoor Kids continuation:', await ingestEvents(musicBoxCandidates, { sourceId: MUSIC_BOX_SOURCE_ID, actor: 'claude:manual-sourcing-2026-08-22' }))
  const taggedMusicBox = await db
    .update(events)
    .set({ topic: 'Movie Night' })
    .where(and(eq(events.sourceId, MUSIC_BOX_SOURCE_ID), like(events.title, 'Indoor Kids:%'), isNull(events.topic)))
    .returning({ id: events.id })
  console.log(`Tagged ${taggedMusicBox.length} Indoor Kids rows with topic 'Movie Night'.`)

  // Confirmed live 2026-08-22 via naturemuseum.org/events — only one future
  // date is currently published for this weekly Wednesday program (same
  // "only what's genuinely announced, never fabricate further out" posture
  // as this same day's Sunday Crafternoon/Low-Line Market continuations).
  const castingCandidates: CandidateEvent[] = [
    {
      title: 'Casting on the Pier',
      description: "Casting On The Pier is back! Join us every Wednesday, weather permitting. Free with admission.",
      startDate: '2026-08-26',
      startTime: '11:00',
      allDay: false,
      address: PEGGY_NOTEBAERT_ADDRESS,
      locationName: 'Peggy Notebaert Nature Museum',
      sourceUrl: 'https://naturemuseum.org/events',
      status: 'approved',
    },
  ]
  console.log('Casting on the Pier continuation:', await ingestEvents(castingCandidates, { sourceId: PEGGY_NOTEBAERT_SOURCE_ID, actor: 'claude:manual-sourcing-2026-08-22' }))
  const taggedCasting = await db
    .update(events)
    .set({ topic: 'Sports & Fitness' })
    .where(and(eq(events.sourceId, PEGGY_NOTEBAERT_SOURCE_ID), eq(events.title, 'Casting on the Pier'), isNull(events.topic)))
    .returning({ id: events.id })
  console.log(`Tagged ${taggedCasting.length} Casting on the Pier rows with topic 'Sports & Fitness'.`)
}

await main()
process.exit(0)
