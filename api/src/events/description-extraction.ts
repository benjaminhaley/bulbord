import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { todayInChicago } from '../dates.js'
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
import type { ExtractedEventFields } from './photo-extraction.js'

// Feedback #133 ("if I don't wanna enter a picture, my other option should
// be to describe the event in words... look up the details based on that
// description using a similar pipeline just like in the photo system") —
// a second on-ramp into the same review-before-post flow feedback #93 built
// (see AddEventModal.tsx/photo-extraction.ts), this time starting from a
// member-typed sentence or two instead of a photo. Deliberately its own
// file rather than folded into photo-extraction.ts — the two stages here
// have real, structural differences from their photo-flow counterparts
// (see each function's own comment), not just a different input type, and
// Ben's own request was explicit: "this is a big change, so please don't
// attempt to do it bundled with others." Shares its timeout/deadline
// constants and small JSON-parsing helpers with photo-extraction.ts via
// extraction-shared.ts, rather than forking a second copy of them.

// Stage 1 differs from photo-extraction's in one real way: a poster almost
// always prints its own date, so photo's stage 1 gives up entirely
// (`{"found": false}`) when no date is legible. A typed description often
// won't state a date precisely enough to resolve on its own ("the Nettelhorst
// fall festival", with no date at all) — for this flow that's not a dead
// end, it's exactly the case stage 2's web search below exists to solve. So
// stage 1 here only requires a title, not a start_date, to count as
// "found" — see toStage1Fields's relaxed validation below. Also unlike
// photo-extraction's stage 1, this prompt doesn't ask for all_day at all —
// it's derived purely from whether a start_time came back (see
// toStage1Fields), since a model-reported all_day and a model-reported
// start_time can contradict each other, and the derived signal is the more
// reliable of the two.
const EXTRACT_SYSTEM_PROMPT = `You extract event details from a short free-text description a member typed describing a real event they want to add to a family/community events app in the Chicago area (feedback #133). The member did not attach a photo — this description is all you have to work with directly. It may be as sparse as a name and a rough time reference, or as detailed as a full listing copied from somewhere else.

Rules:
- title: a short, clear name for the event, drawn from what's actually said — don't invent one from nothing.
- start_date must be YYYY-MM-DD when you can determine one. If the description gives a relative date ("this Saturday", "next Friday", "tomorrow", "in two weeks"), resolve it using "today" as context — pick the soonest real occurrence on or after today. If the description gives no date reference specific enough to resolve to a real calendar date, omit start_date entirely rather than guessing — a later web search will try to pin it down.
- If a specific start time is stated, set start_time to 24-hour HH:MM. If an end time or time range is also given, set end_time the same way. Omit start_time/end_time if nothing gives a specific time (a later web search may still find real hours).
- description: a short one-to-two sentence plain-language summary, only if the input actually gives enough to summarize beyond just restating the title — omit rather than pad.
- location_name/address: only if the description actually names a venue or gives an address — don't guess a street address from a venue name you merely recognize, even a well-known one (that's what the web-search stage is for).
- source_url: only if the description itself contains a literal URL — never invent or guess one.
- topic: pick the single best match from this fixed list if one clearly applies, otherwise omit the field entirely: ${JSON.stringify(TOPIC_OPTIONS)}
- If the description doesn't name anything recognizable as a real event at all (too vague, or not describing an event), respond with exactly {"found": false} and nothing else.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "title": string, "description"?: string, "start_date"?: string, "start_time"?: string, "end_time"?: string, "address"?: string, "location_name"?: string, "source_url"?: string, "topic"?: string}
{"found": false}`

// Stage 2 differs from photo-extraction's findEventSource in scope, not
// just input: photo's stage 2 only ever needs to fill a URL and (sometimes)
// an address, since a poster's own printed text has almost always already
// supplied the date/time. A typed description frequently hasn't, so this
// stage is asked to find and confirm the *whole* event, not just its
// source — real date/time/address included — using the description (plus
// whatever stage 1 already extracted, so it isn't re-deriving the obvious)
// as the search's starting point. Same "the real hosting org's own page,
// never a generic listing/ticketing site" rigor as photo's version and this
// codebase's other sourcing passes (CLAUDE.md's Camps checklist item 4,
// Events' "find the stable host" item 9). Doesn't ask for all_day either,
// for the same reason stage 1 doesn't — see DiscoveredEventDetails' own
// comment.
const SEARCH_SYSTEM_PROMPT = `You are finding the real, specific, dated event a family-app member is describing, and its real official web page, using web search — for a family events app in the Chicago area.

You're given the member's own free-text description, plus whatever a first pass already confidently extracted from it (which may be nothing). Your job is to identify the actual real-world event being described and confirm/fill in as much of its real detail as you can find — not just its source page.

Rules:
- Search for the event's own hosting organization (a school, park district, library, church, chamber of commerce, business — whatever actually runs it), not a generic listing/ticketing/aggregator site.
- Only return fields you are genuinely confident in from what you found — omit anything you can't confirm rather than guessing. It's fine to find only a source URL and nothing else, or a real date but no address, or nothing at all.
- start_date must be YYYY-MM-DD, resolved to a real, upcoming (on or after "today") occurrence — never a past date.
- source_name should be the organization's own real name, not the page title or domain.
- address: a specific, correct street address the way Google Maps would resolve it, only if genuinely confirmed — never a guess or approximation.
- topic: pick the single best match from this fixed list if one clearly applies, otherwise omit: ${JSON.stringify(TOPIC_OPTIONS)}
- If a web search turns up nothing you're genuinely confident matches the described event, respond with exactly {"found": false} and nothing else — never invent one to fill the gap.

Respond with ONLY a JSON object, no markdown fences, no explanation, one of:
{"found": true, "source_url"?: string, "source_name"?: string, "title"?: string, "description"?: string, "start_date"?: string, "start_time"?: string, "end_time"?: string, "address"?: string, "location_name"?: string, "topic"?: string}
{"found": false}`

function trimmedOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// Deliberately more lenient than photo-extraction.ts's own toExtractedFields:
// start_date is optional here (see EXTRACT_SYSTEM_PROMPT's own comment on
// why) — only a title is required for stage 1 to count as "found".
function toStage1Fields(raw: RawExtractedFields): ExtractedEventFields | null {
  if (raw.found !== true) return null
  const title = trimmedOrUndefined(raw.title)
  if (!title) return null

  const startTime = trimmedOrUndefined(raw.start_time)
  return {
    title,
    description: trimmedOrUndefined(raw.description),
    // ExtractedEventFields types start_date/all_day as required (matching
    // photo-extraction's own shape, reused as-is rather than forked into a
    // second, looser type) — an unresolved date just comes back as an
    // empty string, exactly how AddEventModal.tsx already renders a
    // partial photo extraction into EventForm's initial values.
    start_date: trimmedOrUndefined(raw.start_date) ?? '',
    start_time: startTime,
    end_time: trimmedOrUndefined(raw.end_time),
    // Derived from whether a real start_time came back — the prompt above
    // doesn't ask the model for all_day at all, so there's nothing to
    // trust or contradict here in the first place.
    all_day: !startTime,
    address: trimmedOrUndefined(raw.address),
    location_name: trimmedOrUndefined(raw.location_name),
    source_url: isHttpUrl(raw.source_url) ? raw.source_url.trim() : undefined,
    topic: typeof raw.topic === 'string' && TOPIC_OPTIONS.includes(raw.topic) ? raw.topic : undefined,
  }
}

// Stage 1: a fast, non-search text call — reads whatever the member's own
// words already state outright (feedback #133's "describe the event in
// words" half). No web search, so this is the quick path that fills the
// review form the instant it resolves, same UX shape as photo-extraction's
// vision-only stage 1. Best-effort like every Claude-backed feature in this
// codebase: a missing key, a malformed response, a timeout, or the model
// finding nothing at all in the description all degrade to null.
export async function extractEventFieldsFromDescription(description: string): Promise<ExtractedEventFields | null> {
  return withDeadline(extractInner(description), null, STAGE_DEADLINE_MS)
}

async function extractInner(description: string): Promise<ExtractedEventFields | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 1000,
        output_config: { effort: 'medium' },
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify({ description, today: todayInChicago() }) }],
      },
      { timeout: CALL_TIMEOUT_MS, maxRetries: CALL_MAX_RETRIES },
    )

    if (message.stop_reason === 'refusal') return null
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    return toStage1Fields(JSON.parse(stripJsonCodeFence(raw)) as RawExtractedFields)
  } catch {
    return null
  }
}

// Everything stage 2 might contribute — a superset of DiscoveredEventSource
// (photo-extraction's stage 2 result), since this search is responsible for
// finding the whole event, not just its source (see SEARCH_SYSTEM_PROMPT's
// own comment). Every field is optional and additive: the frontend only
// ever applies one of these to a field that's still empty, same
// non-clobbering convention as photo-extraction's stage-2 suggestions. No
// `all_day` here — a specific find here is a real start_time or nothing;
// the "is this all-day" question is answered the same way stage 1's own
// toStage1Fields answers it (derived from start_time's presence), not by
// asking the model a second, potentially-contradictory yes/no question.
export interface DiscoveredEventDetails {
  source_url?: string
  source_name?: string
  title?: string
  description?: string
  start_date?: string
  start_time?: string
  end_time?: string
  address?: string
  location_name?: string
  topic?: string
}

function toDiscoveredDetails(raw: RawExtractedFields & { source_url?: unknown; source_name?: unknown }): DiscoveredEventDetails | null {
  if (raw.found !== true) return null

  const details: DiscoveredEventDetails = {
    source_url: isHttpUrl(raw.source_url) ? raw.source_url.trim() : undefined,
    source_name: trimmedOrUndefined(raw.source_name),
    title: trimmedOrUndefined(raw.title),
    description: trimmedOrUndefined(raw.description),
    start_date: trimmedOrUndefined(raw.start_date),
    start_time: trimmedOrUndefined(raw.start_time),
    end_time: trimmedOrUndefined(raw.end_time),
    address: trimmedOrUndefined(raw.address),
    location_name: trimmedOrUndefined(raw.location_name),
    topic: typeof raw.topic === 'string' && TOPIC_OPTIONS.includes(raw.topic) ? raw.topic : undefined,
  }
  // Genuinely found nothing at all worth applying — treat the same as a
  // clean "not found" rather than a technically-non-null empty object.
  const hasAnyField = Object.values(details).some((v) => v !== undefined)
  return hasAnyField ? details : null
}

// Stage 2: a live web search for the real event being described — always
// worth attempting for this flow (unlike photo-extraction's conditional
// stage 2), since even a stage-1 success from clearly-stated text still
// benefits from a confirmed real source page, and a stage-1 failure means
// this is the *only* remaining path to a usable result at all. Deliberately
// takes the raw description text, not just stage 1's structured fields —
// the original wording often carries context ("the one Fern always talks
// about", "near the school") a search benefits from that a title/address
// pair alone would lose. `alreadyKnown` is a best-effort hint, not a
// dependency: this is safe to call before, or without waiting for, stage 1
// to resolve (see AddEventModal.tsx's handleDescription, which fires both
// stages concurrently for exactly this reason) — an empty hint just means
// the search has to work everything out on its own from the description.
export async function findEventDetailsFromDescription(
  description: string,
  alreadyKnown: Partial<ExtractedEventFields>,
): Promise<DiscoveredEventDetails | null> {
  return withDeadline(searchInner(description, alreadyKnown), null, SEARCH_STAGE_DEADLINE_MS)
}

async function searchInner(description: string, alreadyKnown: Partial<ExtractedEventFields>): Promise<DiscoveredEventDetails | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system: SEARCH_SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: JSON.stringify({ description, already_known: alreadyKnown, today: todayInChicago() }) }],
      },
      { timeout: SEARCH_CALL_TIMEOUT_MS, maxRetries: SEARCH_CALL_MAX_RETRIES },
    )

    if (message.stop_reason === 'refusal') return null
    const block = [...message.content].reverse().find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    return toDiscoveredDetails(
      JSON.parse(stripJsonCodeFence(raw)) as RawExtractedFields & { source_url?: unknown; source_name?: unknown },
    )
  } catch {
    return null
  }
}
