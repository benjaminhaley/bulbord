import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { todayInChicago } from '../dates.js'
import { getImageObject } from '../uploads/storage.js'
import {
  CALL_MAX_RETRIES,
  CALL_TIMEOUT_MS,
  isHttpUrl,
  SEARCH_CALL_MAX_RETRIES,
  SEARCH_CALL_TIMEOUT_MS,
  SEARCH_STAGE_DEADLINE_MS,
  STAGE_DEADLINE_MS,
  TOPIC_OPTIONS,
  withDeadline,
  type RawExtractedFields,
} from './extraction-shared.js'

const EXTRACT_SYSTEM_PROMPT = `You extract event details from a photo of a poster, flyer, or a screenshot of an online listing, for a family/community events app in the Chicago area (feedback #93 — "take a picture of a poster around town and have everything auto populate").

Rules:
- Read every visible line of text in the image carefully, including small print (exact date, time, address, pricing/ticket info).
- start_date must be YYYY-MM-DD. If a date is printed with no year (e.g. "Sunday, September 20th"), infer the year using "today" as context — pick the soonest real occurrence of that calendar date on or after today, not a past one.
- If a specific start time is printed, set start_time to 24-hour HH:MM and all_day to false. If nothing gives a specific time (or it explicitly runs all day), omit start_time and set all_day to true.
- If the poster gives a time *range* (e.g. "11am-3pm", "doors at 6, show ends 9"), set end_time to the range's own end, also 24-hour HH:MM. Omit end_time when only a single start time is given — never guess an end time that isn't actually printed.
- description: a short one-to-two sentence plain-language summary of what the event actually is — don't just copy the poster's own headline text back verbatim. Mention notable pricing/ticket details here if the poster has them.
- location_name is an optional human-friendly venue/place name — keep it short and quickly recognizable (e.g. "Hawthorne School", not the full formal name printed on the poster like "Hawthorne Scholastic Academy Turf"); drop sub-venue specifics (a field name, a room number) that don't help someone recognize the place at a glance. address is an optional street address, only if one is actually printed on the poster — don't guess a street address from a venue name you merely recognize, even a well-known one (that's what the source-search stage is for).
- source_url: only if a website/URL is legibly printed on the poster itself (e.g. "more info at hsapta.org") — the poster's own stated URL, never a guess. Omit if none is printed; a QR code with no visible URL text doesn't count, since it can't be read from a photo.
- topic: pick the single best match from this fixed list if one clearly applies, otherwise omit the field entirely: ${JSON.stringify(TOPIC_OPTIONS)}
- If you can't confidently read a real, dated, upcoming event from this image at all (a blurry photo, no event-like content), respond with exactly {"found": false} and nothing else — never invent one.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "title": string, "description"?: string, "start_date": string, "start_time"?: string, "end_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string, "source_url"?: string, "topic"?: string}
{"found": false}`

// Stage 2 only — a slower, separate call the frontend makes in parallel
// with the member already reviewing stage 1's fast result (feedback,
// 2026-08-23: "first a very fast stage where you just get as much
// information from the image... then a second, slower stage where you look
// up the source URL online"). Same "the URL is the actual page you'd book
// from, never a generic vendor/ticketing platform" rigor this codebase's
// other sourcing passes already apply (CLAUDE.md's Camps checklist item 4,
// Events' "find the stable host" item 9) — just applied live instead of by
// hand.
const SOURCE_SEARCH_SYSTEM_PROMPT = `You are finding the real, official web page — and, if the venue's own street address wasn't already given, that address — for a specific real-world event, for a family events app.

Rules:
- Search for the event's own hosting organization (a school, park district, library, church, chamber of commerce, business — whatever actually runs it), not a generic listing/ticketing/aggregator site.
- Only return a URL you are genuinely confident is that organization's own real page for this event (or, failing that, that organization's own real events/calendar page in general) — if a web search turns up nothing you're confident in, say so.
- source_name should be the organization's own real name (e.g. "Hawthorne Scholastic Academy"), not the page title or domain.
- address: only if you find the venue's real, confirmed street address (e.g. from its own official page) and no address was already given to you — a specific, correct address the way Google Maps would resolve it, never a guess or an approximation. Omit entirely if not confidently found.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "url": string, "source_name": string, "address"?: string}
{"found": false}`

export interface ExtractedEventFields {
  title: string
  description?: string
  start_date: string
  start_time?: string
  end_time?: string
  all_day: boolean
  address?: string
  location_name?: string
  source_url?: string
  topic?: string
}

export interface DiscoveredEventSource {
  url: string
  sourceName: string
  address?: string
}

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const SUPPORTED_MEDIA_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// uploadImage() (uploads/storage.ts) always returns a URL of the form
// "/uploads/<folder>/<id>.<ext>" — getImageObject() wants the bare key.
function keyFromImageUrl(url: string): string {
  return url.replace(/^\/uploads\//, '')
}

async function bufferFromStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function toExtractedFields(raw: RawExtractedFields): ExtractedEventFields | null {
  if (raw.found !== true) return null
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null
  if (typeof raw.start_date !== 'string' || !raw.start_date.trim()) return null

  return {
    title: raw.title.trim(),
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : undefined,
    start_date: raw.start_date.trim(),
    start_time: typeof raw.start_time === 'string' && raw.start_time.trim() ? raw.start_time.trim() : undefined,
    end_time: typeof raw.end_time === 'string' && raw.end_time.trim() ? raw.end_time.trim() : undefined,
    all_day: raw.all_day === true,
    address: typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : undefined,
    location_name: typeof raw.location_name === 'string' && raw.location_name.trim() ? raw.location_name.trim() : undefined,
    source_url: isHttpUrl(raw.source_url) ? raw.source_url.trim() : undefined,
    topic: typeof raw.topic === 'string' && TOPIC_OPTIONS.includes(raw.topic) ? raw.topic : undefined,
  }
}

// Stage 1: reads an already-uploaded image straight out of the bucket (the
// caller has already run it through the normal POST /uploads flow, same as
// any other member-attached photo) and asks Claude to read a real event out
// of it — vision only, no web search, so this is the fast path (feedback,
// 2026-08-23: "a very fast stage where you just get as much information
// from the image as possible"). The frontend prefills and shows the review
// form the instant this resolves; stage 2 (findEventSource, below) runs
// afterward, in parallel with the member already looking at the form.
//
// Best-effort like every other Claude-backed feature here — a missing key,
// an unreadable image, a malformed model response, a timeout, or the model
// finding nothing all degrade to null, never throw — the caller surfaces an
// honest "couldn't read that, fill it in yourself" result on null rather
// than the member ever seeing a raw error or an indefinite hang.
export async function extractEventFieldsFromPhoto(imageUrl: string): Promise<ExtractedEventFields | null> {
  return withDeadline(extractEventFieldsFromPhotoInner(imageUrl), null, STAGE_DEADLINE_MS)
}

async function extractEventFieldsFromPhotoInner(imageUrl: string): Promise<ExtractedEventFields | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  const object = await getImageObject(keyFromImageUrl(imageUrl))
  if (!object) return null

  const mediaType: SupportedMediaType = SUPPORTED_MEDIA_TYPES.has(object.contentType ?? '')
    ? (object.contentType as SupportedMediaType)
    : 'image/jpeg'

  try {
    const buffer = await bufferFromStream(object.body)

    const message = await anthropic.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 1000,
        output_config: { effort: 'medium' },
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
              { type: 'text', text: JSON.stringify({ today: todayInChicago() }) },
            ],
          },
        ],
      },
      { timeout: CALL_TIMEOUT_MS, maxRetries: CALL_MAX_RETRIES },
    )

    if (message.stop_reason === 'refusal') return null
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    return toExtractedFields(JSON.parse(stripJsonCodeFence(raw)) as RawExtractedFields)
  } catch {
    return null
  }
}

interface RawSourceSearch {
  found?: unknown
  url?: unknown
  source_name?: unknown
  address?: unknown
}

// Stage 2: a live web search for the event's real hosting organization —
// only worth calling when stage 1 didn't already find a URL printed on the
// poster itself. Deliberately a separate exported function (not chained
// automatically inside stage 1 anymore) so the frontend can run it in the
// background while the member is already reviewing/editing stage 1's
// result, and can still apply — or discard — whatever it finds regardless
// of whether the member has already posted by the time it resolves (see
// AddEventModal.tsx and PATCH /events/:id's source_name handling).
//
// Best-effort, same posture as stage 1 — a missing key, a search-tool
// error, a timeout, an unparseable response, or genuine "couldn't find
// anything I'm confident in" all degrade to null rather than guessing.
export async function findEventSource(
  fields: Pick<ExtractedEventFields, 'title' | 'location_name' | 'address'>,
): Promise<DiscoveredEventSource | null> {
  return withDeadline(findEventSourceInner(fields), null, SEARCH_STAGE_DEADLINE_MS)
}

async function findEventSourceInner(
  fields: Pick<ExtractedEventFields, 'title' | 'location_name' | 'address'>,
): Promise<DiscoveredEventSource | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system: SOURCE_SEARCH_SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              title: fields.title,
              location_name: fields.location_name ?? null,
              address: fields.address ?? null,
            }),
          },
        ],
      },
      { timeout: SEARCH_CALL_TIMEOUT_MS, maxRetries: SEARCH_CALL_MAX_RETRIES },
    )

    if (message.stop_reason === 'refusal') return null
    const block = [...message.content].reverse().find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as RawSourceSearch
    if (parsed.found !== true) return null
    if (!isHttpUrl(parsed.url)) return null
    if (typeof parsed.source_name !== 'string' || !parsed.source_name.trim()) return null

    return {
      url: parsed.url.trim(),
      sourceName: parsed.source_name.trim(),
      address: typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : undefined,
    }
  } catch {
    return null
  }
}
