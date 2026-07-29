import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'

// Ben asked to add two more sources by name: Merlo Library and the Nettelhorst
// Bike Bus. No new events from either yet — the bike bus runs Fridays per
// Block Club Chicago (Apr 2026) but no exact departure time is published
// anywhere I could verify, so I didn't want to guess one for a public listing.

async function upsertSource(name: string, url: string, type: string, notes: string) {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(eventSources)
    .values({ name, url, type, notes })
    .returning({ id: eventSources.id })
  return created.id
}

async function main() {
  await upsertSource(
    'Chicago Public Library — Merlo Branch',
    'https://www.chipublib.org/locations/51/',
    'website',
    'Closest branch to Nettelhorst (~0.5mi). Individual event pages are on BiblioCommons (chipublib.bibliocommons.com) — check periodically for new programs.',
  )

  await upsertSource(
    'Nettelhorst Bike Bus',
    'https://www.instagram.com/nettelhorstbike/',
    'instagram',
    'Runs Fridays per Block Club Chicago (Apr 2026 coverage) — exact departure time not published anywhere verifiable as of 2026-07-29, so no event added yet.',
  )

  console.log('Sources added.')
}

await main()
process.exit(0)
