import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { enrichEventImage } from './image-enrichment.js'

// Found via a targeted Wikimedia Commons search ("teenagers video games") a
// real, on-topic photo: two teens playing a console game on a couch in a
// "GAME ON"-branded library gaming lounge (Edmonton Public Library,
// Oct 2025) — viewed directly and confirmed as a genuine match for "Teens
// in grades 7-12 play Nintendo Switch" before use, not assumed from a
// search hit alone. Applied to both Power Up Thursdays occurrences.
const EVENT_IDS = ['8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', 'e89c8c83-a6e9-4beb-ae69-52a3610f5b35']
const PHOTO_URL =
  'https://upload.wikimedia.org/wikipedia/commons/0/06/Two_teenagers_playing_video_games_at_Edmonton%27s_downtown_library%2C_October_15_2025.jpg'

async function main() {
  const rows = await db.select({ id: events.id, description: events.description }).from(events).where(eq(events.id, EVENT_IDS[0]))
  const [first] = rows
  const { result } = await enrichEventImage(first.id, {
    sourceUrl: null,
    overrideImageUrl: PHOTO_URL,
    title: 'Power Up Thursdays',
    description: first.description,
  })
  console.log(`First row: ${result}`)

  const [second] = await db.select({ description: events.description }).from(events).where(eq(events.id, EVENT_IDS[1]))
  const result2 = await enrichEventImage(EVENT_IDS[1], {
    sourceUrl: null,
    overrideImageUrl: PHOTO_URL,
    title: 'Power Up Thursdays',
    description: second.description,
  })
  console.log(`Second row: ${result2.result}`)
}

await main()
process.exit(0)
