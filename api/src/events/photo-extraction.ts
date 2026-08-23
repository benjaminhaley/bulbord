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
- topic: pick the single best match from this fixed list if one clearly applies, otherwise omit the field entirely: ${JSON.stringify(TOPIC_OPTIONS)}
- If you can't confidently read a real, dated, upcoming event from this image at all (a blurry photo, no event-like content), respond with exactly {"found": false} and nothing else — never invent one.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "title": string, "description"?: string, "start_date": string, "start_time"?: string, "all_day": boolean, "address"?: string, "location_name"?: string, "topic"?: string}
{"found": false}`

export interface ExtractedEventFields {
  title: string
  description?: string
  start_date: string
  start_time?: string
  all_day: boolean
  address?: string
  location_name?: string
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
  topic?: unknown
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
    topic: typeof raw.topic === 'string' && TOPIC_OPTIONS.includes(raw.topic) ? raw.topic : undefined,
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

    return toExtractedFields(JSON.parse(stripJsonCodeFence(raw)) as RawExtraction)
  } catch {
    return null
  }
}
