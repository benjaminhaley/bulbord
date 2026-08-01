import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Ben asked (via Feedback) for Music Box Theatre's family movie series
// specifically — not all showtimes at all theaters, not even all Music Box
// showtimes. That's "Indoor Kids: Family-Friendly Matinees", a recurring
// series with its own page distinct from the theater's general "Weekend
// Matinees" series (which is repertory/classic film for a general audience,
// not kid-specific). Sourced 2026-08-01 via WebFetch of the series page;
// nothing fabricated. Inserted as 'approved' directly — no admin review UI
// yet, same exception as prior seed batches.

async function main() {
  const sourceUrl = 'https://musicboxtheatre.com/series-and-festivals/indoor-kids-family-friendly-matinees'

  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, sourceUrl)).limit(1)
  const sourceId =
    existing?.id ??
    (
      await db
        .insert(eventSources)
        .values({
          name: 'Music Box Theatre — Indoor Kids: Family-Friendly Matinees',
          url: sourceUrl,
          type: 'website',
          notes: '3733 N Southport Ave. Recurring family matinee series, Theater 3. Not the general "Weekend Matinees" series (that one skews adult repertory).',
        })
        .returning({ id: eventSources.id })
    )[0].id

  const candidates: CandidateEvent[] = [
    {
      title: 'Indoor Kids: Hercules',
      description: 'Family-friendly matinee series at Music Box Theatre. Animated Hercules (1997).',
      startDate: '2026-08-01',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/hercules',
      // Music Box's HTML pages sit behind a Sucuri WAF that 307s our plain
      // server-side fetch() (no browser User-Agent) into a challenge page, so
      // extraction can't reach them — verified this image URL directly
      // (curl 200, image/jpeg) and supply it to bypass extraction entirely.
      imageUrl: 'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/film-images/Hercules.jpg',
      status: 'approved',
    },
    {
      title: 'Indoor Kids: Hercules',
      description: 'Family-friendly matinee series at Music Box Theatre. Animated Hercules (1997).',
      startDate: '2026-08-02',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/hercules',
      imageUrl: 'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/film-images/Hercules.jpg',
      status: 'approved',
    },
    {
      title: 'Indoor Kids: Jason and the Argonauts',
      description: 'Family-friendly matinee series at Music Box Theatre. Ray Harryhausen stop-motion classic (1963).',
      startDate: '2026-08-08',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/jason-and-the-argonauts',
      imageUrl:
        'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/jason-and-the-argonauts-still-1.jpg',
      status: 'approved',
    },
    {
      title: 'Indoor Kids: Jason and the Argonauts',
      description: 'Family-friendly matinee series at Music Box Theatre. Ray Harryhausen stop-motion classic (1963).',
      startDate: '2026-08-09',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/jason-and-the-argonauts',
      imageUrl:
        'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/jason-and-the-argonauts-still-1.jpg',
      status: 'approved',
    },
    {
      title: 'Indoor Kids: The Secret World of Arrietty',
      description: 'Family-friendly matinee series at Music Box Theatre. Studio Ghibli.',
      startDate: '2026-08-29',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/the-secret-world-of-arrietty',
      imageUrl:
        'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/the-secret-world-of-arrietty-still-1.jpeg',
      status: 'approved',
    },
    {
      title: 'Indoor Kids: The Secret World of Arrietty',
      description: 'Family-friendly matinee series at Music Box Theatre. Studio Ghibli.',
      startDate: '2026-08-30',
      startTime: '11:00',
      allDay: false,
      address: '3733 N Southport Ave, Chicago, IL 60613',
      locationName: 'Music Box Theatre',
      latitude: '41.944703',
      longitude: '-87.664131',
      sourceUrl: 'https://musicboxtheatre.com/films-and-events/the-secret-world-of-arrietty',
      imageUrl:
        'https://musicboxtheatre.com/sites/default/files/styles/page_images/public/the-secret-world-of-arrietty-still-1.jpeg',
      status: 'approved',
    },
  ]

  const result = await ingestEvents(candidates, { sourceId, actor: 'claude:manual-sourcing-2026-08-01' })
  console.log(`Ingested: ${result.inserted} inserted, ${result.skipped} skipped (already present).`)
}

await main()
process.exit(0)
