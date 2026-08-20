import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createSession } from './service.js'

// One-off, run against production: mints a fresh sign-in link for the
// existing App Review account (see update-2026-08-12-create-reviewer-account.ts)
// for a resubmission's Notes for Review. Doesn't create a new account or a
// new events_log entry -- the account already exists and its creation was
// already logged; this just issues a new session the way a real login would.
async function main() {
  const [reviewer] = await db.select().from(users).where(eq(users.email, 'app-review@bulbord.com'))

  if (!reviewer) {
    throw new Error('App Review account not found (email app-review@bulbord.com)')
  }

  const { token } = await createSession(reviewer.id)

  console.log(`Sign-in link: https://nettelhorst.bulbord.com/?signInToken=${token}`)
}

await main()
process.exit(0)
