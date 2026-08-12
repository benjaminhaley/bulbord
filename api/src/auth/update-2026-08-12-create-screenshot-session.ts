import 'dotenv/config'

import { createSession } from './service.js'

// One-off, run once against production: mints a real session for Ben's
// existing account (not a new/fake account) so screenshots of the actual
// invite-gated app can be captured for the App Store listing. Same
// createSession() the real login flow uses.
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'

async function main() {
  const { token } = await createSession(BEN_USER_ID)
  console.log(token)
}

await main()
process.exit(0)
