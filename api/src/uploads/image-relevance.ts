import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'

// A genuine content-relevance scorer, on top of image-quality.ts's own
// dimension/aspect-ratio gate — added 2026-09-04 per feedback #158: "images
// should be unique and compelling... if I were to put the description on
// one side and the images on another, it should be easy for anybody to
// match them up... apply an image scoring algorithm on these three
// criteria: unique, matches description, appealing." isLowQualityImage()
// only ever checked pixel dimensions/aspect ratio — a real, sharp, correctly
// -sized photo of the WRONG thing (a hosting org's own generic branding
// photo, a stock photo of an unrelated scene) sails through that gate every
// time, which is exactly what several real events had: a virtual info
// session about a leadership-training program illustrated with a photo of
// volunteers picking up litter in a forest, another illustrated with a
// nature museum's own generic greenhouse marketing photo. Neither is
// low-quality by the old definition; both fail to actually depict what the
// event is. This uses Claude's vision input directly (a real, on-topic
// judgment call, the same kind of "look at the actual image" discipline
// this codebase's own sourcing history already treats as load-bearing —
// see CLAUDE.md's "open the actual uploaded file and look at it" checklist
// item) rather than trying to infer relevance from metadata alone.
const SCORING_SYSTEM_PROMPT = `You are scoring a candidate photo for a specific event listing on a family community-events app. You'll be shown the image along with the event's title and description.

Score the image on three criteria:
1. Matches: does the image actually depict this specific event/subject, not just something generically related (a hosting organization's own logo/branding photo, a stock photo of a similar-but-different activity, a generic photo of the venue with no connection to this event's own content)?
2. Unique: is this a specific, real photo (not a generic stock/branding image that could illustrate any of that organization's unrelated events)?
3. Appealing: is it a clear, reasonably attractive photo (not blurry, oddly cropped, dominated by a text overlay/logo, or otherwise unpleasant to look at)?

An image only needs to be reasonably good on all three, not perfect — the bar is "would a reader immediately understand this image represents this event," not "professional stock photography." When in doubt between a mediocre real photo and rejecting to placeholder, prefer keeping a real photo that clearly matches the subject even if not exceptionally appealing.

Respond with ONLY JSON, no markdown fences, no explanation: {"keep": boolean, "reason": string} — reason is one short phrase either way.`

interface RawScoreResult {
  keep?: unknown
  reason?: unknown
}

export interface ImageRelevanceScore {
  keep: boolean
  // Always populated, even when keep is true — kept regardless of outcome
  // (not just for a rejection) so a *chosen* image's own reasoning is also
  // debuggable after the fact via events_log, not only a rejected one. Null
  // only for the fail-open paths (no API key, unrecognized format, refusal,
  // malformed output) where no real model judgment happened at all.
  reason: string | null
}

function guessMediaType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

// Best-effort like every other Claude-backed step in this pipeline: no API
// key, an unrecognized image format, a refusal, or malformed output all
// fail OPEN (the candidate is kept) rather than blocking image enrichment —
// this is an additional filter layered on top of the existing quality gate,
// which still runs either way, not a replacement for it. A transient
// failure here shouldn't discard an otherwise-passing candidate; the real
// goal is catching a confidently-wrong match, not gatekeeping availability.
export async function scoreImageRelevance(
  buffer: Buffer,
  { title, description }: { title: string; description?: string | null },
): Promise<ImageRelevanceScore> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return { keep: true, reason: null }

  const mediaType = guessMediaType(buffer)
  if (!mediaType) return { keep: true, reason: null }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 200,
      output_config: { effort: 'low' },
      system: SCORING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
            { type: 'text', text: JSON.stringify({ title, description: description ?? null }) },
          ],
        },
      ],
    })

    if (message.stop_reason === 'refusal') return { keep: true, reason: null }
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { keep: true, reason: null }

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as RawScoreResult
    return {
      keep: parsed.keep !== false,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
    }
  } catch {
    return { keep: true, reason: null }
  }
}
