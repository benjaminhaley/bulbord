import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventsLog } from '../db/schema.js'

// Feedback #158 screenshot showed a plain green placeholder card for one
// occurrence of the Music Box Theatre "Indoor Kids: Harry and the
// Hendersons" matinee series — a sibling occurrence of the exact same real
// movie already has the correct poster image uploaded. Same title, same
// film, so reusing the sibling's already-uploaded, already-verified image is
// correct (this is exactly the "same-titled recurring occurrence may share
// one real photo" case isSharedListingPage/isAlreadyClaimedImage are
// deliberately scoped to allow) rather than re-running the whole
// download/quality/relevance pipeline for an image that's already proven
// good for this exact title.
const PLACEHOLDER_EVENT_ID = '254ceedf-c9b6-43c0-b98e-bccdf890cab8'
const GOOD_SIBLING_EVENT_ID = '9b4ea1ab-2c46-47a6-8c8b-686898051539'

async function main() {
  const [sibling] = await db
    .select({ imageUrl: events.imageUrl, thumbnailUrl: events.thumbnailUrl, sourceImageUrl: events.sourceImageUrl })
    .from(events)
    .where(eq(events.id, GOOD_SIBLING_EVENT_ID))
  if (!sibling) throw new Error('Sibling event not found')

  await db
    .update(events)
    .set({
      imageUrl: sibling.imageUrl,
      thumbnailUrl: sibling.thumbnailUrl,
      sourceImageUrl: sibling.sourceImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(events.id, PLACEHOLDER_EVENT_ID))

  await db.insert(eventsLog).values({
    actor: 'claude:manual-sourcing',
    action: 'event_corrected',
    metadata: {
      reason: 'feedback #158: replaced a generated placeholder with the same-titled sibling occurrence\'s already-verified real poster image',
      eventId: PLACEHOLDER_EVENT_ID,
    },
  })

  console.log('Done.')
}

await main()
process.exit(0)
