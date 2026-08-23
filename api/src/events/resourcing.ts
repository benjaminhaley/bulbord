import * as cheerio from 'cheerio'
import { and, eq, isNull, sql } from 'drizzle-orm'

import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { db } from '../db/client.js'
import { todayInChicago } from '../dates.js'
import { eventSources } from '../db/schema.js'
import { fetchWithTimeout } from '../uploads/fetch-with-timeout.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

const FETCH_TIMEOUT_MS = 10_000
// Bounds the LLM call's input size/cost — plenty for a listings page's own
// text, and avoids paying to send a whole bloated page (nav chrome, footers,
// scripts already stripped below) through the model.
const MAX_PAGE_TEXT_CHARS = 15_000
const RESOURCE_CONCURRENCY = 3

const SYSTEM_PROMPT = `You extract upcoming events from a scraped webpage's visible text, for a family/community events app in the Chicago area.

Rules:
- Only include events happening today or in the future, relative to the given "today" date — never past events.
- If "source_notes" says to scope down to something specific (e.g. "only the kids' movie series"), only include events matching that scope — ignore everything else on the page.
- start_date must be YYYY-MM-DD. If the page gives a specific time, set start_time to 24-hour HH:MM and all_day to false; if there's genuinely no specific time (or the event runs all day), omit start_time and set all_day to true.
- description is optional: a short one-sentence description if the page gives useful detail, otherwise omit it.
- location_name is an optional human-friendly venue name (not a street address) when the page names one; address is an optional street address.
- If a recurring series lists multiple future occurrences, include each occurrence as its own entry with its own date.
- If you can't confidently identify any real, dated, upcoming events on this page, return an empty array — never invent one.

Respond with ONLY a JSON array, no markdown fences, no explanation. Each element:
{"title": string, "description"?: string, "start_date": string, "start_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string}`

interface ExtractedEvent {
  title?: unknown
  description?: unknown
  start_date?: unknown
  start_time?: unknown
  all_day?: unknown
  address?: unknown
  location_name?: unknown
}

function toCandidateEvent(raw: ExtractedEvent, sourceUrl: string): CandidateEvent | null {
  if (typeof raw.title !== 'string' || typeof raw.start_date !== 'string') return null
  if (raw.start_date < todayInChicago()) return null

  return {
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    startDate: raw.start_date,
    startTime: typeof raw.start_time === 'string' ? raw.start_time : undefined,
    allDay: raw.all_day === true,
    address: typeof raw.address === 'string' ? raw.address : undefined,
    locationName: typeof raw.location_name === 'string' ? raw.location_name : undefined,
    sourceUrl,
    // Automated extraction is never hand-vetted, so it goes through the same
    // pending-review queue as any other sourced/user-submitted event (see
    // CLAUDE.md's Events data model & sourcing) — never auto-approved.
    status: 'pending',
  }
}

// Fetches a known source's page and asks Claude to pull out any real,
// upcoming, dated events from its visible text. Best-effort like
// image-enrichment.ts/title-normalization.ts: any failure (unreachable page,
// no API key, malformed model output) degrades to "found nothing" rather
// than throwing, so one broken source can't fail the whole admin-triggered
// re-sourcing run.
export async function extractCandidateEventsFromSource(
  sourceUrl: string,
  notes: string | null,
): Promise<CandidateEvent[]> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return []

  const response = await fetchWithTimeout(sourceUrl, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return []
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) return []

  try {
    const html = await response.text()
    const $ = cheerio.load(html)
    $('script, style, nav, footer, noscript').remove()
    const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT_CHARS)
    if (!pageText) return []

    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ today: todayInChicago(), source_url: sourceUrl, source_notes: notes, page_text: pageText }),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return []
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return []

    const parsed = JSON.parse(stripJsonCodeFence(raw))
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => toCandidateEvent(item as ExtractedEvent, sourceUrl))
      .filter((c): c is CandidateEvent => c !== null)
  } catch {
    return []
  }
}

interface SourceResourceResult {
  sourceId: string
  name: string
  added: number
  skipped: number
  error?: string
}

export interface ResourceReport {
  sourcesChecked: number
  totalAdded: number
  totalSkipped: number
  lastCheckedAt: Date | null
  results: SourceResourceResult[]
}

// The most recent time any active source was checked — shown in Developer
// Tools (feedback #41 follow-up) so an admin can tell whether "0 added" just
// happened or the tool hasn't actually run recently.
export async function getSourcesLastCheckedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastCheckedAt: sql<Date | null>`max(${eventSources.lastCheckedAt})` })
    .from(eventSources)
    .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))
  return row?.lastCheckedAt ?? null
}

// Re-runs the ingestion pipeline against every known active source (feedback
// #41) — deliberately re-scrapes sources already in event_sources rather
// than also discovering brand-new ones, which stays a separate, occasional
// manual ask (as feedback #12/#22/#24 were) rather than something an admin
// button can trigger repeatedly in production.
export async function resourceActiveEventSources(actor: string): Promise<ResourceReport> {
  const sources = await db
    .select()
    .from(eventSources)
    .where(and(eq(eventSources.isActive, true), isNull(eventSources.deletedAt)))

  const results: SourceResourceResult[] = new Array(sources.length)
  let index = 0

  async function worker() {
    while (index < sources.length) {
      const i = index++
      const source = sources[i]
      try {
        const candidates = await extractCandidateEventsFromSource(source.url, source.notes)
        const { inserted, skipped } = await ingestEvents(candidates, { sourceId: source.id, actor })
        await db.update(eventSources).set({ lastCheckedAt: new Date() }).where(eq(eventSources.id, source.id))
        results[i] = { sourceId: source.id, name: source.name, added: inserted, skipped }
      } catch (err) {
        results[i] = {
          sourceId: source.id,
          name: source.name,
          added: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(RESOURCE_CONCURRENCY, sources.length) }, worker))

  return {
    sourcesChecked: sources.length,
    totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
    lastCheckedAt: await getSourcesLastCheckedAt(),
    results,
  }
}
