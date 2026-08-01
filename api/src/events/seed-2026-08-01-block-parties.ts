import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Ben asked (via Feedback) to find block parties within ~1mi of Nettelhorst
// and add them as a source + real events. Unlike the app's other sources,
// Chicago actually publishes this as clean open data: CDOT's "Transportation
// Department Permits - Block Party - Current and Future" dataset
// (data.cityofchicago.org, resource id 9zhy-9n5f) has per-permit lat/long, so
// this queries it live via Socrata's SoQL `within_circle` rather than
// hand-searching — rerunning this script later picks up newly-filed permits
// for free (ingestEvents already dedupes on title+startDate+sourceUrl).
//
// Worth flagging: block party permits are typically for the residents of
// that specific block (a closed street with neighbors' own tables/grills),
// not an open public event the way a festival is — descriptions below say
// so explicitly rather than implying anyone can just show up.

const NETTELHORST_LAT = 41.94167
const NETTELHORST_LNG = -87.64472
const RADIUS_METERS = 1609 // ~1 mile
const RESOURCE_URL = 'https://data.cityofchicago.org/resource/9zhy-9n5f.json'
const SOURCE_URL =
  'https://data.cityofchicago.org/Transportation/Transportation-Department-Permits-Block-Party-Curr/9zhy-9n5f'

interface BlockPartyPermit {
  applicationstartdate: string
  applicationstatus: string
  currentmilestone: string
  streetnumberfrom: string
  direction: string
  streetname: string
  suffix: string
}

async function fetchNearbyPermits(sinceDate: string): Promise<BlockPartyPermit[]> {
  const url = new URL(RESOURCE_URL)
  url.searchParams.set(
    '$where',
    `within_circle(location, ${NETTELHORST_LAT}, ${NETTELHORST_LNG}, ${RADIUS_METERS}) AND applicationstartdate >= '${sinceDate}T00:00:00'`,
  )
  url.searchParams.set('$order', 'applicationstartdate')
  url.searchParams.set('$limit', '200')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Socrata request failed: ${response.status}`)
  }
  return (await response.json()) as BlockPartyPermit[]
}

async function upsertSource(name: string, url: string, type: string, notes: string) {
  const [existing] = await db.select().from(eventSources).where(eq(eventSources.url, url)).limit(1)
  if (existing) return existing.id

  const [created] = await db.insert(eventSources).values({ name, url, type, notes }).returning({ id: eventSources.id })
  return created.id
}

function titleCaseWord(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase()
}

// "Closed" + "Complete" means the permit finished processing and was
// approved — not that the event was cancelled. Anything else (e.g. still
// "Application Checks"/"Application in Review") hasn't been finalized yet.
function toCandidate(permit: BlockPartyPermit): CandidateEvent {
  const block = `${Math.floor(Number(permit.streetnumberfrom) / 100) * 100}`
  const streetLabel = `${permit.direction} ${titleCaseWord(permit.streetname)} ${titleCaseWord(permit.suffix)}`
  const finalized = permit.applicationstatus === 'Closed' && permit.currentmilestone === 'Complete'
  const pendingNote = finalized ? '' : ' (permit still in review as of this sourcing pass, not yet finalized)'

  return {
    title: `Block Party: ${block} block of ${streetLabel}`,
    description: `Neighborhood block party for residents of the ${block} block of ${streetLabel} — street closure permitted by Chicago DOT${pendingNote}. Typically organized informally by that block's own residents, not a general public event, but a good one to know about if you're nearby or invited.`,
    startDate: permit.applicationstartdate.slice(0, 10),
    allDay: true,
    address: `${block} ${streetLabel}, Chicago, IL`,
    locationName: `${block} block of ${streetLabel}`,
    sourceUrl: SOURCE_URL,
    status: 'approved',
  }
}

async function main() {
  const sourceId = await upsertSource(
    'Chicago DOT Block Party Permits — near Nettelhorst',
    SOURCE_URL,
    'open_data',
    'Chicago Data Portal dataset of CDOT block party street-closure permits, queried live via SoQL `within_circle` (1mi / 1609m radius of Nettelhorst, 41.94167,-87.64472) — a real public dataset exists for this, unlike most other sources here. Rerun this script periodically to pick up newly-filed permits; a permit shows applicationstatus "Closed" + currentmilestone "Complete" once approved (not cancelled).',
  )

  const today = new Date().toISOString().slice(0, 10)
  const permits = await fetchNearbyPermits(today)
  const candidates = permits.map(toCandidate)
  const result = await ingestEvents(candidates, { sourceId, actor: 'claude:manual-sourcing' })
  console.log(`Fetched ${permits.length} permits from Socrata; ingest result:`, result)
}

await main()
process.exit(0)
