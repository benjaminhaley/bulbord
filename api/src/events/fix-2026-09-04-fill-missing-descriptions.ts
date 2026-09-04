import 'dotenv/config'
import { inArray } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Continuing feedback #146/#151's "there should not be events without
// descriptions" rule, found while auditing the wider shared-image cluster
// cleanup (2026-09-04). Four Merlo Branch programs and two zoo events had
// blank descriptions. Real source pages (chipublib.org/locations/51/,
// lpzoo.org/calendar-events/) confirmed only a date/time for these — no
// further description text exists there to quote — so these are short,
// honest descriptions of what the program plainly is by name/context
// (Merlo's real YOUmedia recording studio, confirmed via chipublib.org),
// not invented specifics. "Spring Egg-Stravaganza" is the one exception
// with a real, detailed description available (lpzoo.org's own event page).
const UPDATES: { eventId: string; description: string }[] = [
  {
    eventId: 'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
    description: 'A social painting session at the Merlo Branch.',
  },
  {
    eventId: '29873c7f-60cc-40c2-9f11-413615d60710', // Cozy Crafting
    description: 'A relaxed drop-in craft session at the Merlo Branch.',
  },
  {
    eventId: 'de1d7385-680c-4ef5-be15-fc3722141bff', // Musical Theater Club
    description: 'A club for teens interested in musical theater at the Merlo Branch.',
  },
  {
    eventId: 'dc43a5c0-f80d-4091-9c86-d6ba260f29ef', // Recording Studio Certification for Teens
    description: "Hands-on certification for teens to use Merlo's YOUmedia recording studio equipment.",
  },
  {
    eventId: 'b90a9441-28d7-4515-9ab7-b88b09d64261', // New Year's ReZoolutions
    description: "A New Year's-themed day at Lincoln Park Zoo, playing on \"resolutions.\"",
  },
  {
    eventId: '10d6cd9e-2737-4df0-93dd-d9889bd80d90', // Spring Egg-Stravaganza
    description:
      'Family egg hunt across six zones by age and difficulty, plus photos with the Easter Bunny, carousel and train rides, and a kid-friendly DJ.',
  },
]

async function main() {
  for (const update of UPDATES) {
    const [row] = await db
      .update(events)
      .set({ description: update.description, updatedAt: new Date() })
      .where(inArray(events.id, [update.eventId]))
      .returning({ id: events.id, title: events.title })
    if (row) console.log(`Updated "${row.title}" (${row.id})`)
    else console.log(`No event found for ${update.eventId}`)
  }

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'feedback #146/#151 follow-up: filled in missing descriptions found while auditing the wider image cleanup',
      eventIds: UPDATES.map((u) => u.eventId),
    },
  })
}

await main()
process.exit(0)
