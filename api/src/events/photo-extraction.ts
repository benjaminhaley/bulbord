import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { todayInChicago } from '../dates.js'
import { getImageObject } from '../uploads/storage.js'

// Mirrors web/src/events/topics.ts's EVENT_TOPIC_OPTIONS, minus "Other"
// (which the model should just omit for rather than pick) — a small
// hardcoded literal here rather than a cross-package import, since there's
// no shared package between api/ and web/ (see CLAUDE.md's Newsletter "kept
// in sync" note) and topic is free text with no server-side enum to begin
// with.
const TOPIC_OPTIONS = ['Movie Night', 'Sports & Fitness', 'Arts & Crafts', 'Community & Social']

const SYSTEM_PROMPT = `You extract event details from a photo of a poster, flyer, or a screenshot of an online listing, for a family/community events app in the Chicago area (feedback #93 — "take a picture of a poster around town and have everything auto populate").

Rules:
- Read every visible line of text in the image carefully, including small print (exact date, time, address, pricing/ticket info).
- start_date must be YYYY-MM-DD. If a date is printed with no year (e.g. "Sunday, September 20th"), infer the year using "today" as context — pick the soonest real occurrence of that calendar date on or after today, not a past one.
- If a specific start time is printed, set start_time to 24-hour HH:MM and all_day to false. If nothing gives a specific time (or it explicitly runs all day), omit start_time and set all_day to true.
- description: a short one-to-two sentence plain-language summary of what the event actually is — don't just copy the poster's own headline text back verbatim. Mention notable pricing/ticket details here if the poster has them.
- location_name is an optional human-friendly venue/place name (e.g. a school or park name); address is an optional street address, only if one is actually printed on the poster — don't guess a street address from a venue name you merely recognize.
- source_url: only if a website/URL is legibly printed on the poster itself (e.g. "more info at hsapta.org") — the poster's own stated URL, never a guess. Omit if none is printed; a QR code with no visible URL text doesn't count, since it can't be read from a photo.
- topic: pick the single best match from this fixed list if one clearly applies, otherwise omit the field entirely: ${JSON.stringify(TOPIC_OPTIONS)}
- If you can't confidently read a real, dated, upcoming event from this image at all (a blurry photo, no event-like content), respond with exactly {"found": false} and nothing else — never invent one.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "title": string, "description"?: string, "start_date": string, "start_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string, "source_url"?: string, "topic"?: string}
{"found": false}`

// Follow-up call, only made when the poster itself printed no URL — tries to
// find the real hosting organization's own page via a live web search
// (Ben, 2026-08-23: "have the backend job try to find a source URL"), same
// "the URL is the actual page you'd book from, never a generic vendor/
// ticketing platform" rigor this codebase's other sourcing passes already
// apply (see CLAUDE.md's Camps data-sourcing checklist item 4 and Events'
// "find the stable host" item 9) — just applied live instead of by hand.
const SOURCE_SEARCH_SYSTEM_PROMPT = `You are finding the real, official web page for a specific real-world event, to use as a "source URL" for a family events app.

Rules:
- Search for the event's own hosting organization (a school, park district, library, church, chamber of commerce, business — whatever actually runs it), not a generic listing/ticketing/aggregator site.
- Only return a URL you are genuinely confident is that organization's own real page for this event (or, failing that, that organization's own real events/calendar page in general) — if a web search turns up nothing you're confident in, say so.
- source_name should be the organization's own real name (e.g. "Hawthorne Scholastic Academy"), not the page title or domain.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "url": string, "source_name": string}
{"found": false}`

export interface ExtractedEventFields {
  title: string
  description?: string
  start_date: string
  start_time?: string
  all_day: boolean
  address?: string
  location_name?: string
  source_url?: string
  source_name?: string
  topic?: string
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

interface RawExtraction {
  found?: unknown
  title?: unknown
  description?: unknown
  start_date?: unknown
  start_time?: unknown
  all_day?: unknown
  address?: unknown
  location_name?: unknown
  source_url?: unknown
  topic?: unknown
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    return ['http:', 'https:'].includes(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

function toExtractedFields(raw: RawExtraction): ExtractedEventFields | null {
  if (raw.found !== true) return null
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null
  if (typeof raw.start_date !== 'string' || !raw.start_date.trim()) return null

  return {
    title: raw.title.trim(),
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : undefined,
    start_date: raw.start_date.trim(),
    start_time: typeof raw.start_time === 'string' && raw.start_time.trim() ? raw.start_time.trim() : undefined,
    all_day: raw.all_day === true,
    address: typeof raw.address === 'string' && raw.address.trim() ? raw.address.trim() : undefined,
    location_name: typeof raw.location_name === 'string' && raw.location_name.trim() ? raw.location_name.trim() : undefined,
    source_url: isHttpUrl(raw.source_url) ? raw.source_url.trim() : undefined,
    topic: typeof raw.topic === 'string' && TOPIC_OPTIONS.includes(raw.topic) ? raw.topic : undefined,
  }
}

interface RawSourceSearch {
  found?: unknown
  url?: unknown
  source_name?: unknown
}

// Best-effort, same posture as everything else here — a missing key, a
// search-tool error, an unparseable response, or genuine "couldn't find
// anything I'm confident in" all degrade to null rather than guessing.
async function findSourceUrl(fields: Pick<ExtractedEventFields, 'title' | 'location_name' | 'address'>): Promise<{ url: string; sourceName: string } | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const message = await anthropic.messages.create({
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
    })

    if (message.stop_reason === 'refusal') return null
    const block = [...message.content].reverse().find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as RawSourceSearch
    if (parsed.found !== true) return null
    if (!isHttpUrl(parsed.url)) return null
    if (typeof parsed.source_name !== 'string' || !parsed.source_name.trim()) return null

    return { url: parsed.url.trim(), sourceName: parsed.source_name.trim() }
  } catch {
    return null
  }
}

// Reads an already-uploaded image straight out of the bucket (the caller has
// already run it through the normal POST /uploads flow, same as any other
// member-attached photo) and asks Claude to read a real event out of it.
//
// Best-effort like every other Claude-backed feature here — a missing key,
// an unreadable image, a malformed model response, or the model finding
// nothing all degrade to null — but unlike title-normalization.ts/
// resourcing.ts's fire-and-forget callers, this runs synchronously inside a
// member's own "add event" flow (feedback #93's "processing" step), so the
// caller surfaces an honest "couldn't read that, fill it in yourself" state
// on a null result rather than silently skipping.
export async function extractEventFromPhoto(imageUrl: string): Promise<ExtractedEventFields | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  const object = await getImageObject(keyFromImageUrl(imageUrl))
  if (!object) return null

  const mediaType: SupportedMediaType = SUPPORTED_MEDIA_TYPES.has(object.contentType ?? '')
    ? (object.contentType as SupportedMediaType)
    : 'image/jpeg'

  try {
    const buffer = await bufferFromStream(object.body)

    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
            { type: 'text', text: JSON.stringify({ today: todayInChicago() }) },
          ],
        },
      ],
    })

    if (message.stop_reason === 'refusal') return null
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    const fields = toExtractedFields(JSON.parse(stripJsonCodeFence(raw)) as RawExtraction)
    if (!fields) return null

    // The poster printed no URL itself — try to find the real hosting
    // organization's own page via a live search before giving up (Ben,
    // 2026-08-23). A failed/uncertain search just leaves source_url unset,
    // same as every other best-effort step in this function.
    if (!fields.source_url) {
      const found = await findSourceUrl(fields)
      if (found) {
        fields.source_url = found.url
        fields.source_name = found.sourceName
      }
    }

    return fields
  } catch {
    return null
  }
}
