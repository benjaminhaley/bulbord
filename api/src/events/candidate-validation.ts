import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import type { CandidateEvent } from './ingest.js'

// A second, independent check on already-extracted candidates — not just
// more rules piled into the one extraction prompt (extraction-filters.ts's
// AUDIENCE_RELEVANCE_RULES). Added 2026-09-04 after feedback #155/#156/#157
// found three real listings that survived that single extraction call
// despite it already having rules that should have caught two of them (a
// bar/drink "crawl" mislabeled as a neighborhood festival, an explicitly
// 18+ program held at a normally family-friendly venue). A single call that
// has to both parse messy page text into structured events AND hold every
// nuanced relevance judgment in mind at once has already demonstrably
// missed things a dedicated second look would catch — the same "don't
// trust one shot, verify independently" lesson this codebase has already
// applied elsewhere (e.g. image-enrichment.ts's isSharedListingPage/
// isAlreadyClaimedImage as a second check beyond the one quality gate,
// duplicate-detection.ts as a second check beyond the one exact-match
// dedup). This pass reviews only the small, already-structured fields
// (title/description/address/locationName) against three bright-line
// triggers, rather than re-reading the whole page — a narrower, cheaper,
// more reliable task than extraction itself, and one where a miss in this
// prompt's wording isn't the same miss as a gap in the other one.
const VALIDATION_SYSTEM_PROMPT = `You are reviewing a list of already-extracted candidate events for a family/community events app serving Nettelhorst School families (pre-K through 8th grade) in Chicago. For each event, decide whether it should be REJECTED for any of these reasons:

1. Age-restricted: the event's own title/description states an age restriction (e.g. "18+," "21+," "adults only," "ages 21 and up") or is otherwise explicitly not for children — regardless of how family-friendly the venue normally is.
2. Bar/drink crawl: the event is a "crawl" format — walking between multiple bars/restaurants/venues to sample food and/or alcohol (a pub crawl, bar crawl, progressive dinner, "food and drink sampling crawl") — even if it's citywide, one-time, or framed as a neighborhood festival. A single-site festival or street fair with one central location (an Oktoberfest, a market, a "Market Days" street festival) is NOT a crawl and should be kept.
3. Vague location: for an IN-PERSON event, neither address nor location_name names a specific, real-world place a person could navigate to (a street address, or a specific venue/business name). A bare neighborhood, business district, or general area name (e.g. "Northalsted," "Lakeview," "downtown," "the West Loop") does not count as specific, even as location_name. Does NOT apply to a genuinely virtual/online event (a webinar, a virtual info session) — those have no physical location by nature, so no address is expected or required.

Respond with ONLY a JSON array, same length and order as the input, no markdown fences, no explanation. Each element: {"keep": boolean, "reason"?: string} — reason only when keep is false, one short phrase naming which of the three triggers applied.`

interface ValidationResult {
  keep?: unknown
  reason?: unknown
}

interface RejectedCandidate {
  title: string
  reason: string
}

export interface CandidateValidationResult {
  kept: CandidateEvent[]
  // Every rejection, with the model's own stated reason — added 2026-09-04
  // alongside the rest of this pass's debuggability work (see
  // image-enrichment.ts's ImageCandidateTrace for the image-side
  // equivalent): before this, a filtered-out candidate's title and the
  // reason it was dropped were gone the moment .filter() ran, with no way
  // to later check "did the filter actually fire here, and why" short of
  // re-running extraction by hand. The caller (resourcing.ts/email-ingest.ts)
  // logs this into the same events_ingested events_log row every other run
  // summary already lands in.
  rejected: RejectedCandidate[]
}

// Best-effort like every other Claude-backed step in this pipeline
// (title-normalization.ts, image-enrichment.ts's web-search fallback): no
// API key, a refusal, or malformed output all fail OPEN (candidates pass
// through unfiltered) rather than blocking ingestion — this is a second,
// additional layer on top of the extraction prompt's own first-pass
// filtering, not the only thing standing between a bad listing and going
// live, so a transient failure here shouldn't discard otherwise-good
// events. A genuine gap in judgment (this call actually running but making
// the wrong call) is the real risk this exists to reduce, not availability.
export async function filterFamilyRelevantCandidates(candidates: CandidateEvent[]): Promise<CandidateValidationResult> {
  if (candidates.length === 0) return { kept: candidates, rejected: [] }

  const anthropic = getAnthropicClient()
  if (!anthropic) return { kept: candidates, rejected: [] }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: VALIDATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            candidates.map((c) => ({
              title: c.title,
              description: c.description ?? null,
              address: c.address ?? null,
              location_name: c.locationName ?? null,
            })),
          ),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return { kept: candidates, rejected: [] }
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { kept: candidates, rejected: [] }

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as unknown
    if (!Array.isArray(parsed) || parsed.length !== candidates.length) return { kept: candidates, rejected: [] }

    const kept: CandidateEvent[] = []
    const rejected: RejectedCandidate[] = []
    candidates.forEach((candidate, i) => {
      const verdict = parsed[i] as ValidationResult
      if (verdict?.keep === false) {
        rejected.push({ title: candidate.title, reason: typeof verdict.reason === 'string' ? verdict.reason : 'unspecified' })
      } else {
        kept.push(candidate)
      }
    })
    return { kept, rejected }
  } catch {
    return { kept: candidates, rejected: [] }
  }
}
