import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Feedback #146/#151/#153 (2026-09-04): several real, correctly-scraped
// events were missing a description (or, for #153, a time) that's actually
// available with a bit of research — Ben: "there has to be sentiment
// information about it online... event should always have a description."
// Each fact below was verified live (WebSearch) before use, not invented:
//
// - "Live Music" (Northalsted's recurring Space Park concert series):
//   northalsted.com's own announcement + event pages confirm the series is
//   free, outdoor, at Space Park (815 W. Roscoe, behind Roscoe's Tavern),
//   bring-your-own-chair, 6-8pm — that's the recurring pattern's own stated
//   shape, not specific to Sep 3/4 by name (no confirmed lineup for these
//   exact dates was found), so the description/time describe the series
//   itself rather than claiming a specific act neither date's page named.
// - "Power Up Thursdays" (Merlo library): a real recurring CPL teen program
//   — Nintendo Switch and board games, ages/grades 7-12 — confirmed via
//   do312.com's own listing.
// - "Movies in The Parking Lot: Clue" had a description already but no
//   start_time — northalsted.com's own listing didn't resolve to a specific
//   time via WebFetch (401'd), so this uses the series' own established
//   outdoor-movie-night convention (dusk/early evening) is NOT assumed;
//   left for the companion Retro-on-Roscoe-image fix pass since no
//   confirmed time was actually found — see that script's own notes.
const UPDATES: { eventId: string; description?: string; startTime?: string }[] = [
  {
    eventId: 'd28f73c2-fa04-4915-8659-b20e1f0ef1fa', // Live Music, Sep 3
    description:
      "Northalsted's free outdoor concert series at Space Park (815 W. Roscoe, behind Roscoe's Tavern) — bring a chair for an evening of local live music.",
    startTime: '18:00',
  },
  {
    eventId: '736975d5-99c7-4171-bd37-a78c81305189', // Live Music, Sep 4
    description:
      "Northalsted's free outdoor concert series at Space Park (815 W. Roscoe, behind Roscoe's Tavern) — bring a chair for an evening of local live music.",
    startTime: '18:00',
  },
  {
    eventId: 'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays, Sep 3
    description: 'Teens in grades 7-12 play Nintendo Switch and fast-paced board games at the Merlo Branch.',
  },
  {
    eventId: '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays, Sep 17
    description: 'Teens in grades 7-12 play Nintendo Switch and fast-paced board games at the Merlo Branch.',
  },
  {
    eventId: 'bd3d494d-e7b8-4865-9f73-f137e3f85b88', // Roscoe Village Neighbors: Retro on Roscoe
    description:
      'Roscoe Village’s annual retro street festival — live 70s/80s/90s music on three stages, a classic and antique car show, and vintage shopping along Roscoe Street.',
  },
]

async function main() {
  for (const update of UPDATES) {
    const [row] = await db
      .update(events)
      .set({
        ...(update.description ? { description: update.description } : {}),
        ...(update.startTime ? { startTime: update.startTime, allDay: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(events.id, update.eventId))
      .returning({ id: events.id, title: events.title })

    if (row) console.log(`Updated "${row.title}" (${row.id})`)
    else console.log(`No event found for ${update.eventId}`)
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'feedback #146/#151/#152: added real, researched descriptions/times that were missing',
      eventIds: UPDATES.map((u) => u.eventId),
    },
  })
}

await main()
process.exit(0)
