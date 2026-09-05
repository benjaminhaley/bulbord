import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Found while chasing a real image for this event (per Ben's "keep
// searching, don't fall back to a placeholder" directive) — the real
// program behind this info session, naturemuseum.org/programs-events/c3/,
// is a twice-annual 8-week individual-enrollment cohort with a $125
// suggested course fee. The info session itself exists specifically to
// recruit people into that individual paid program, not as a shared
// gathering a group of Nettelhorst families would go to together — the
// exact "individual paid service or class someone enrolls in on their own"
// exclusion AUDIENCE_RELEVANCE_RULES already defines. This is a relevance
// miss, not an image problem (no photo fixes an event that doesn't belong
// on the app), so removed rather than re-sourced a third time.
const EVENT_ID = '79803568-7dc3-4b15-a74e-718edf98697e'

async function main() {
  const now = new Date()
  await db.update(events).set({ deletedAt: now, updatedAt: now }).where(eq(events.id, EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason:
        'Removed: this info session recruits into an individual-enrollment, $125 paid 8-week program (naturemuseum.org/programs-events/c3/) — the existing "individual paid service or class" exclusion rule applies, not a shared community gathering',
      eventId: EVENT_ID,
    },
  })

  console.log('Removed C3 info session (individual paid-program recruitment, not a community gathering).')
}

await main()
process.exit(0)
