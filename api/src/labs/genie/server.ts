import 'dotenv/config'

import Anthropic from '@anthropic-ai/sdk'

import { claudeAgent } from './agent.js'
import { buildGenieApp } from './app.js'
import { bulbordMemberVerifier } from './members.js'
import { memoryStore, postgresStore } from './store.js'

// Genie's own process (labs/genie/README.md). Runs as the `genie` Railway
// service from the same image as the API, with start command
// `node dist/labs/genie/server.js`. Locally: `npm run genie:dev` (port 3002).
//
// Env:
//   ANTHROPIC_API_KEY        required
//   BULBORD_API_URL          where to check a member's sign-in (default: local API)
//   GENIE_DATABASE_URL       the lab_genie login; unset = state kept in memory
//   GENIE_ALLOWED_ORIGINS    comma-separated page origins
//   GENIE_EFFORT             low | medium | high (default medium)
//   GENIE_FAST               1 = fast mode (about 2.5x faster, 2x the price)
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required')
const effort = process.env.GENIE_EFFORT
const app = await buildGenieApp({
  agent: claudeAgent(new Anthropic({ apiKey }), {
    effort: effort === 'low' || effort === 'high' ? effort : 'medium',
    fast: process.env.GENIE_FAST === '1',
  }),
  store: process.env.GENIE_DATABASE_URL ? postgresStore(process.env.GENIE_DATABASE_URL) : memoryStore(),
  verifyMember: bulbordMemberVerifier(process.env.BULBORD_API_URL ?? 'http://localhost:3001'),
  allowedOrigins: (process.env.GENIE_ALLOWED_ORIGINS ?? 'https://nettelhorst.bulbord.com,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  logger: true,
})
await app.listen({ port: Number(process.env.PORT ?? 3002), host: '0.0.0.0' })
