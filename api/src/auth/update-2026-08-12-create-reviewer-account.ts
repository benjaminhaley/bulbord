import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'
import { createSession } from './service.js'

// One-off, run once against production: a dedicated account for Apple App
// Review (feedback #61) so a reviewer can open one link and land fully
// signed in -- no passkey ceremony, no profile form to fill out. A normal,
// already-onboarded member account (invited by Ben, profile complete),
// not a special-cased backdoor -- same bearer-token auth every real session
// already uses, just delivered via a URL instead of a WebAuthn ceremony
// (see web/src/main.tsx's ?signInToken= handling). Kept separate from
// Ben's own account so review traffic doesn't mix into his real identity.
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'

async function main() {
  const [reviewer] = await db
    .insert(users)
    .values({
      name: 'App Review',
      email: 'app-review@bulbord.com',
      invitedByUserId: BEN_USER_ID,
      profileCompletedAt: new Date(),
      role: 'other',
      roleOther: 'Apple App Review',
      newsletterSubscribed: false,
    })
    .returning()

  const { token } = await createSession(reviewer.id)

  await db.insert(eventsLog).values({
    actor: 'claude:reviewer-account-2026-08-12',
    action: 'user_created',
    metadata: { userId: reviewer.id, reason: 'Apple App Review reviewer account' },
  })

  console.log(`Reviewer user id: ${reviewer.id}`)
  console.log(`Sign-in link: https://nettelhorst.bulbord.com/?signInToken=${token}`)
}

await main()
process.exit(0)
