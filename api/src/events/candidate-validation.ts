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
//
// Tightened 2026-09-05 after running this function against every live
// approved event to verify it actually worked (see the same-dated addition
// to extraction-filters.ts's own header for the full incident and false
// positives found: a kid-inclusive minimum age like "6+" flagged as an
// adult exclusion, a plain "Adult Book Discussion" library category label
// flagged the same way, a bounded street segment flagged as vague, and a
// dog-costume "Pup Crawl" flagged as a bar crawl purely for the word
// "crawl"). Each trigger below now states explicitly what does NOT count,
// mirroring the fixes made to AUDIENCE_RELEVANCE_RULES.
//
// Extended 2026-09-06 (feedback #138, Pipeline Review): this call now always
// returns a reason (previously reject-only) and three additional per-item
// quality judgments — title/description/location — so a kept candidate's
// review data comes from the same single LLM call rather than a second one.
// These three checks are purely informational for the admin review page;
// they never gate whether a candidate is kept, matching this feature's
// "post-hoc audit, not a new publish gate" design.
const VALIDATION_SYSTEM_PROMPT = `You are reviewing a list of already-extracted candidate events for a family/community events app serving Nettelhorst School families (pre-K through 8th grade) in Chicago. For each event, first decide whether it should be REJECTED for any of these reasons:

1. Age-restricted: the event's own title/description EXPLICITLY excludes children — a stated numeric age gate meant to keep minors out (e.g. "18+," "21+," "ages 21 and up") or an explicit "adults only"/"no children" statement — regardless of how family-friendly the venue normally is. Do NOT flag a reasonable MINIMUM age meant to include kids/teens, not exclude them (e.g. "ages 6+," "ages 13+" on a zoo/museum/library program is a normal safety/maturity requirement, not an adult-only exclusion). Do NOT flag a plain audience-category label with no actual stated exclusion (a library "Adult Book Discussion," an "adult"/"grown-ups" branded talk or game night) — that's a programming-category term, not a restriction that children can't attend.
2. Bar/drink crawl: the event is a "crawl" format — walking between multiple bars/restaurants/venues to sample food and/or alcohol (a pub crawl, bar crawl, progressive dinner, "food and drink sampling crawl") — even if it's citywide, one-time, or framed as a neighborhood festival. A single-site festival or street fair with one central location (an Oktoberfest, a market, a "Market Days" street festival) is NOT a crawl and should be kept. The word "crawl" in the title alone is NOT enough to trigger this — check the event's own description for what's actually happening: something that uses "crawl" in its name but doesn't involve visiting bars/drinking alcohol (a costume walk, a pet parade, a scavenger hunt) is a different format and should be kept.
3. Vague location: for an IN-PERSON event, neither address nor location_name names a place a person could navigate to. A street address, a specific venue/business name, OR a street segment bounded by two named cross streets (e.g. "Halsted St between Addison St & Belmont Ave," "Lincoln Ave from Wellington to Diversey") all count as specific enough, even a segment spanning several blocks. Only a bare neighborhood/business district/area name with no street or venue at all (e.g. "Northalsted," "Lakeview," "downtown," "the West Loop," "the Southport corridor" with no street given) fails this. Does NOT apply to a genuinely virtual/online event (a webinar, a virtual info session) — those have no physical location by nature, so no address is expected or required.

Then, whether kept or rejected, judge three more things about the candidate as it's currently written (these never change whether it's kept — they're purely for a human reviewer's own reference):

- titleQuality: pass if the title is a complete, sensible phrase that actually describes the event (even if terse) with no sponsor-name spam. Fail if it's a garbled fragment, cut off mid-word, or so generic/branded it says nothing about what the event actually is.
- descriptionQuality: pass if the description (when present) gives a reader a real sense of what will happen — even a single informative sentence is enough. Fail if the description is missing entirely, or is pure boilerplate/marketing copy that never says what actually happens.
- locationQuality: pass under the same bar as the vague-location trigger above (a real street address, venue/business name, or bounded street segment; a genuinely virtual event needs no address). Fail if the location is missing or only names a neighborhood/area with no street or venue.

Respond with ONLY a JSON array, same length and order as the input, no markdown fences, no explanation. Each element:
{"keep": boolean, "reason": string, "titleQuality": {"pass": boolean, "reason": string}, "descriptionQuality": {"pass": boolean, "reason": string}, "locationQuality": {"pass": boolean, "reason": string}}
"reason" is always required — when keep is true, a short phrase on why the event is relevant; when keep is false, a short phrase naming which of the three rejection triggers applied.`

interface QualityCheck {
  pass: boolean
  reason: string
}

export interface CandidateQualityChecks {
  titleQuality: QualityCheck
  descriptionQuality: QualityCheck
  locationQuality: QualityCheck
}

interface RawQualityCheck {
  pass?: unknown
  reason?: unknown
}

interface ValidationResult {
  keep?: unknown
  reason?: unknown
  titleQuality?: RawQualityCheck
  descriptionQuality?: RawQualityCheck
  locationQuality?: RawQualityCheck
}

interface RejectedCandidate {
  candidate: CandidateEvent
  reason: string
}

export interface CandidateValidationResult {
  // Each kept candidate carries its own .relevanceReason and .qualityChecks,
  // set by this pass — see CandidateEvent (ingest.ts).
  kept: CandidateEvent[]
  // Every rejection, with the model's own stated reason and the full
  // candidate it was rejected from — added 2026-09-04 (title/reason only)
  // and widened 2026-09-06 to carry the whole candidate so a
  // rejected_event_candidates row (and a future "add anyway" action) can be
  // built from it without re-running extraction. The caller
  // (resourcing.ts/email-ingest.ts) also logs the lightweight
  // {title, reason} shape into the same events_ingested events_log row
  // every other run summary already lands in.
  rejected: RejectedCandidate[]
}

function parseQualityCheck(raw: RawQualityCheck | undefined): QualityCheck | null {
  if (!raw || typeof raw.pass !== 'boolean' || typeof raw.reason !== 'string') return null
  return { pass: raw.pass, reason: raw.reason }
}

// Best-effort like every other Claude-backed step in this pipeline
// (title-normalization.ts, image-enrichment.ts's web-search fallback): no
// API key, a refusal, or malformed output all fail OPEN (candidates pass
// through unfiltered, with no reason/qualityChecks set) rather than
// blocking ingestion — this is a second, additional layer on top of the
// extraction prompt's own first-pass filtering, not the only thing standing
// between a bad listing and going live, so a transient failure here
// shouldn't discard otherwise-good events. A genuine gap in judgment (this
// call actually running but making the wrong call) is the real risk this
// exists to reduce, not availability.
export async function filterFamilyRelevantCandidates(candidates: CandidateEvent[]): Promise<CandidateValidationResult> {
  if (candidates.length === 0) return { kept: candidates, rejected: [] }

  const anthropic = getAnthropicClient()
  if (!anthropic) return { kept: candidates, rejected: [] }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3000,
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
      const reason = typeof verdict?.reason === 'string' ? verdict.reason : 'unspecified'
      if (verdict?.keep === false) {
        rejected.push({ candidate, reason })
        return
      }
      const titleQuality = parseQualityCheck(verdict?.titleQuality)
      const descriptionQuality = parseQualityCheck(verdict?.descriptionQuality)
      const locationQuality = parseQualityCheck(verdict?.locationQuality)
      const qualityChecks =
        titleQuality && descriptionQuality && locationQuality ? { titleQuality, descriptionQuality, locationQuality } : undefined
      kept.push({ ...candidate, relevanceReason: reason, qualityChecks })
    })
    return { kept, rejected }
  } catch {
    return { kept: candidates, rejected: [] }
  }
}
