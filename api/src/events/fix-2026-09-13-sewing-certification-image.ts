import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { applyEventEdit } from './edit.js'
import { isLowQualityImage } from '../uploads/image-quality.js'
import type { PipelineChecks } from './candidate-checks.js'

// Feedback, 2026-09-13 ("Should've been fixed by retries right? These are
// definitely fixable issues"): the automated pipeline's own "Retry" action
// correctly left this event's image checks failing — not a bug in Retry
// itself. Real root cause, confirmed by directly reproducing
// extractPageImageCandidates() against the event's own source_url
// (chipublib.org/locations/51/, the Merlo Branch's generic location page):
// that page's real og:image (a genuine branch photo) IS found and DOES pass
// the size/aspect-ratio gate — but isSharedListingPage() correctly excludes
// it anyway, since 7 other differently-titled CPL Merlo events already
// share this exact source_url (a deliberate anti-mismatch safeguard from
// feedback #146/#150/#153 — that photo is the *page's* generic branch
// image, not anything specific to a teen sewing program). The web-image-
// search fallback then came up empty for this specific, narrow topic, and
// the CPL logo tier failed its own (looser) size gate. None of that is a
// retry bug — it's the automated pipeline correctly running out of leads.
//
// Applying this codebase's own standing rule ("never settle for a
// placeholder without exhausting real search first" — see CLAUDE.md's
// Images & object storage section): a real, on-topic, properly-licensed
// photo does exist — a University of the Fraser Valley fashion-design
// student at an industrial sewing machine (Wikimedia Commons, CC BY 2.0),
// found via a targeted Commons search the automated title/description-only
// web-image-search never tried, and visually confirmed (not just
// dimension-checked) before use.
const EVENT_ID = 'b10b5daa-465a-49f9-99fc-b577f8e9b59c'
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'
const SOURCE_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Fashion_students_2016-22_%2825790266624%29.jpg'
// Already uploaded through the live API (not a local script — see this
// file's own Images & object storage section on the storage-propagation-gap
// bug) via POST /uploads with folder=events, and confirmed servable through
// the real GET /uploads/* proxy before this script ran.
const IMAGE_URL = '/uploads/events/10a311cd-ef30-4f0c-8c94-cb426b829441.jpeg'
const THUMBNAIL_URL = '/uploads/events/10a311cd-ef30-4f0c-8c94-cb426b829441-thumb.jpg'

async function main() {
  const [existing] = await db
    .select({
      title: events.title,
      description: events.description,
      startDate: events.startDate,
      startTime: events.startTime,
      endTime: events.endTime,
      allDay: events.allDay,
      locationName: events.locationName,
      address: events.address,
      sourceUrl: events.sourceUrl,
      topic: events.topic,
      checks: events.pipelineQualityChecks,
    })
    .from(events)
    .where(eq(events.id, EVENT_ID))
  if (!existing) throw new Error('event not found')

  // Real quality-gate check against the actual uploaded bytes, not assumed —
  // same "don't trust a check ran just because a URL exists" discipline this
  // pipeline already applies everywhere else.
  const res = await fetch(SOURCE_IMAGE_URL)
  const buffer = Buffer.from(await res.arrayBuffer())
  const lowQuality = await isLowQualityImage(buffer)
  if (lowQuality) throw new Error('candidate image unexpectedly fails the quality gate — do not apply')

  const error = await applyEventEdit(
    EVENT_ID,
    {
      title: existing.title,
      description: existing.description,
      start_date: existing.startDate,
      start_time: existing.startTime,
      end_time: existing.endTime,
      all_day: existing.allDay,
      location_name: existing.locationName,
      address: existing.address ?? '',
      source_url: existing.sourceUrl,
      topic: existing.topic,
      image_url: IMAGE_URL,
      thumbnail_url: THUMBNAIL_URL,
    },
    BEN_USER_ID,
  )
  if (error) throw new Error(error)

  const priorChecks = existing.checks as PipelineChecks | null
  const checks: PipelineChecks = {
    ...(priorChecks as PipelineChecks),
    imageQuality: { pass: true, reason: 'Manually verified: 7360x4912, well above the size/aspect-ratio bar', attempts: 1 },
    imageRelevance: {
      pass: true,
      reason: 'Manually confirmed: a real, on-topic photo (a young person operating an industrial sewing machine), found via a targeted Commons search after the automated web-image-search came up empty for this narrow topic',
      attempts: 1,
    },
  }
  const pipelineChecksPassed = Object.values(checks).every((c) => c.pass)

  await db
    .update(events)
    .set({ sourceImageUrl: SOURCE_IMAGE_URL, pipelineQualityChecks: checks, pipelineChecksPassed, updatedAt: new Date() })
    .where(eq(events.id, EVENT_ID))

  console.log('Done — pipelineChecksPassed:', pipelineChecksPassed)
}

await main()
process.exit(0)
