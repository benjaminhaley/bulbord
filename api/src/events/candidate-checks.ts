// Pipeline Review v2 (2026-09-06, following Ben's first live look at v1): the
// full per-field checklist he asked for — title, description, a short
// human-readable location label, and a real mappable address. (date/time
// coherence and the duplicate result are computed elsewhere, deterministically
// — see ingest.ts — since they don't need a model's judgment; image
// quality/relevance live in image-enrichment.ts, closer to where the image
// itself is found.)
//
// Runs only on candidates that survive dedup inside ingestEvents() — not on
// the whole raw batch pre-dedup (that's still candidate-validation.ts's
// narrower relevance-only job) — so the heavier checks here are never wasted
// on a candidate that's about to be thrown away.
//
// Self-healing: an initial batch call scores all four checks for every
// candidate at once (cheap). Anything with a failing check gets exactly one
// retry call (bounded — see CLAUDE.md's confirmed "bounded retries, no
// background job" decision), given the *original raw source text* (not just
// the already-extracted fields) so it can actually find a better value, not
// just re-guess from the same data. The retry can propose corrected field
// values, which the caller applies before finalizing the row.
import { getAnthropicClient, stripJsonCodeFence } from '../claude.js'
import { addDays } from '../dates.js'

export interface CheckResult {
  pass: boolean
  reason: string
  attempts: number
}

// The full 9-check object stored on an event row (Pipeline Review v2). Only
// titleQuality/descriptionQuality/locationLabelQuality/addressQuality come
// from an LLM call (above) — the rest are deterministic, which is both
// cheaper and more reliable than asking a model to judge something plain
// code can check directly (the same reasoning duplicate-detection.ts already
// applies to dedup, rather than asking a model "is this a duplicate?").
export interface PipelineChecks extends TextChecks {
  dateQuality: CheckResult
  timeQuality: CheckResult
  imageQuality: CheckResult
  imageRelevance: CheckResult
  duplicateCheck: CheckResult
}

// A candidate's start_date should be a real, plausible upcoming date — this
// catches an extraction bug (a garbled or impossible date) that a purely
// LLM-judged check could just as easily repeat. `today` is passed in
// (todayInChicago()) rather than computed here, so this stays a pure,
// directly-testable function like duplicate-detection.ts's own checks.
const MAX_FUTURE_DAYS = 730

export function checkDateQuality(startDate: string, today: string): CheckResult {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { pass: false, reason: `"${startDate}" is not a valid date`, attempts: 1 }
  }
  if (startDate < today) return { pass: false, reason: `${startDate} is in the past`, attempts: 1 }
  if (startDate > addDays(today, MAX_FUTURE_DAYS)) {
    return { pass: false, reason: `${startDate} is implausibly far in the future (over 2 years out)`, attempts: 1 }
  }
  return { pass: true, reason: 'A real, plausible upcoming date', attempts: 1 }
}

// start_time and all_day should never disagree with each other — either a
// specific time is stated (all_day false, start_time set) or the event
// genuinely has none (all_day true, start_time absent). Catches a candidate
// that silently defaulted one without the other.
export function checkTimeQuality(startTime: string | undefined, allDay: boolean): CheckResult {
  if (allDay && !startTime) return { pass: true, reason: 'Marked all-day with no specific time, consistently', attempts: 1 }
  if (!allDay && startTime) return { pass: true, reason: `Has a specific start time (${startTime})`, attempts: 1 }
  if (allDay && startTime) return { pass: false, reason: 'Marked all-day but also has a specific start time set', attempts: 1 }
  return { pass: false, reason: 'No specific time given, but not marked all-day', attempts: 1 }
}

// A kept candidate has, by definition, already survived ingestEvents()'s own
// dedup checks (exact-match + fuzzy same-day) — this is purely a
// transparency line for the admin review page, not a new check to compute.
export function buildDuplicateCheck(): CheckResult {
  return { pass: true, reason: 'No matching event found on the same date', attempts: 1 }
}

export interface TextChecks {
  titleQuality: CheckResult
  descriptionQuality: CheckResult
  locationLabelQuality: CheckResult
  addressQuality: CheckResult
}

export interface TextCheckInput {
  title: string
  description?: string
  address?: string
  locationName?: string
}

export interface TextCheckedCandidate {
  checks: TextChecks
  // Present only when a retry proposed a better value for that field — the
  // caller (ingest.ts) applies these onto the real candidate/row before
  // finalizing it. Absent fields mean the retry didn't touch them.
  correctedFields: Partial<TextCheckInput>
}

const CHECK_NAMES = ['titleQuality', 'descriptionQuality', 'locationLabelQuality', 'addressQuality'] as const
type CheckName = (typeof CHECK_NAMES)[number]

const CHECKS_SYSTEM_PROMPT = `You are scoring already-extracted event candidates for a family/community events app serving Nettelhorst School families (pre-K through 8th grade) in Chicago. For each candidate, judge four things:

- titleQuality: pass if the title is a complete, sensible phrase that actually describes the event (even if terse), with no sponsor-name spam. Fail if it's a garbled fragment, cut off mid-word, or so generic/branded it says nothing about what the event actually is.
- descriptionQuality: pass if the description (when present) gives a reader a real sense of what will happen — even a single informative sentence is enough. Fail if the description is missing entirely, or is pure boilerplate/marketing copy that never says what actually happens.
- locationLabelQuality: pass if there's a short, human-readable venue or place name a person would recognize (e.g. "Merlo Library," "Gallagher Way"). Fail if it's missing or is itself just a bare area/neighborhood name with no venue.
- addressQuality: pass if there's a real, specific, mappable location — a street address, a named venue/business, or a street segment bounded by two named cross streets. Fail if only a bare neighborhood/area name is given with no street or venue. A genuinely virtual/online event needs no address and always passes this one.

Respond with ONLY a JSON array, same length and order as the input, no markdown fences, no explanation. Each element: {"titleQuality": {"pass": boolean, "reason": string}, "descriptionQuality": {"pass": boolean, "reason": string}, "locationLabelQuality": {"pass": boolean, "reason": string}, "addressQuality": {"pass": boolean, "reason": string}}. "reason" is always required, whether passing or failing — a short, specific phrase useful for debugging later.`

const RETRY_SYSTEM_PROMPT = `You previously extracted an event candidate from the source text below, and a review pass found problems with some of its fields. Using the ORIGINAL SOURCE TEXT (not just your own prior extraction), try to fix exactly the fields named as failing — do not change fields that weren't flagged. If the source text genuinely doesn't contain a better answer, leave that field as-is and say so honestly in its reason.

Respond with ONLY a JSON object, no markdown fences, no explanation, containing only the keys for the checks you were asked to fix. Each key's value: {"pass": boolean, "reason": string, "correctedTitle"?: string, "correctedDescription"?: string, "correctedLocationName"?: string, "correctedAddress"?: string} — include a "corrected*" field only when you found a genuinely better value for it from the source text.`

interface RawCheckResult {
  pass?: unknown
  reason?: unknown
}

function parseCheck(raw: RawCheckResult | undefined, fallbackReason: string): CheckResult {
  if (!raw || typeof raw.pass !== 'boolean' || typeof raw.reason !== 'string') {
    return { pass: true, reason: fallbackReason, attempts: 1 }
  }
  return { pass: raw.pass, reason: raw.reason, attempts: 1 }
}

// Fails open — same posture as every other Claude-backed check in this
// pipeline (candidate-validation.ts, image-relevance.ts): no API key, a
// refusal, or malformed output all leave every check passing with a generic
// reason rather than blocking ingestion.
function allPassing(reason: string): TextChecks {
  const result: CheckResult = { pass: true, reason, attempts: 1 }
  return { titleQuality: result, descriptionQuality: result, locationLabelQuality: result, addressQuality: result }
}

// Exported (not just used internally by the retry orchestrator below) so
// pipeline-review-service.ts's Edit action can re-score a single candidate
// after an admin manually fixes a field — no retry needed there, since a
// human already tried to fix it once.
export async function scoreTextChecks(items: TextCheckInput[]): Promise<TextChecks[] | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 3000,
      output_config: { effort: 'low' },
      system: CHECKS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            items.map((c) => ({ title: c.title, description: c.description ?? null, address: c.address ?? null, location_name: c.locationName ?? null })),
          ),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return null
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return null

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as unknown
    if (!Array.isArray(parsed) || parsed.length !== items.length) return null

    return parsed.map((verdict) => {
      const v = verdict as Record<CheckName, RawCheckResult>
      return {
        titleQuality: parseCheck(v.titleQuality, 'Not scored'),
        descriptionQuality: parseCheck(v.descriptionQuality, 'Not scored'),
        locationLabelQuality: parseCheck(v.locationLabelQuality, 'Not scored'),
        addressQuality: parseCheck(v.addressQuality, 'Not scored'),
      }
    })
  } catch {
    return null
  }
}

interface RawRetryResult extends RawCheckResult {
  correctedTitle?: unknown
  correctedDescription?: unknown
  correctedLocationName?: unknown
  correctedAddress?: unknown
}

const FIELD_FOR_CHECK: Record<CheckName, keyof TextCheckInput> = {
  titleQuality: 'title',
  descriptionQuality: 'description',
  locationLabelQuality: 'locationName',
  addressQuality: 'address',
}
const CORRECTED_KEY: Record<CheckName, keyof RawRetryResult> = {
  titleQuality: 'correctedTitle',
  descriptionQuality: 'correctedDescription',
  locationLabelQuality: 'correctedLocationName',
  addressQuality: 'correctedAddress',
}

async function retryOne(
  item: TextCheckInput,
  failingChecks: CheckName[],
  sourceText: string | undefined,
): Promise<{ checks: Partial<TextChecks>; correctedFields: Partial<TextCheckInput> }> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return { checks: {}, correctedFields: {} }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1500,
      output_config: { effort: 'low' },
      system: RETRY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            current_candidate: { title: item.title, description: item.description ?? null, address: item.address ?? null, location_name: item.locationName ?? null },
            checks_to_fix: failingChecks,
            original_source_text: sourceText ? sourceText.slice(0, 12_000) : null,
          }),
        },
      ],
    })

    if (message.stop_reason === 'refusal') return { checks: {}, correctedFields: {} }
    const block = message.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text.trim() : ''
    if (!raw) return { checks: {}, correctedFields: {} }

    const parsed = JSON.parse(stripJsonCodeFence(raw)) as Record<CheckName, RawRetryResult>
    const checks: Partial<TextChecks> = {}
    const correctedFields: Partial<TextCheckInput> = {}
    for (const name of failingChecks) {
      const v = parsed[name]
      if (!v) continue
      checks[name] = parseCheck(v, 'Not re-scored')
      const correctedValue = v[CORRECTED_KEY[name]]
      if (typeof correctedValue === 'string' && correctedValue.trim()) {
        ;(correctedFields as Record<string, string>)[FIELD_FOR_CHECK[name]] = correctedValue.trim()
      }
    }
    return { checks, correctedFields }
  } catch {
    return { checks: {}, correctedFields: {} }
  }
}

// The main entry point — one initial batch call for every candidate, then
// exactly one retry call for each candidate that has any failing check
// (bounded: at most 2 attempts per check, never more).
export async function runTextChecksWithRetry(items: TextCheckInput[], sourceText?: string): Promise<TextCheckedCandidate[]> {
  if (items.length === 0) return []

  const initial = await scoreTextChecks(items)
  if (!initial) return items.map(() => ({ checks: allPassing('Check unavailable'), correctedFields: {} }))

  return Promise.all(
    items.map(async (item, i): Promise<TextCheckedCandidate> => {
      const checks = initial[i]
      const failing = CHECK_NAMES.filter((name) => !checks[name].pass)
      if (failing.length === 0) return { checks, correctedFields: {} }

      const { checks: retried, correctedFields } = await retryOne(item, failing, sourceText)
      const finalChecks: TextChecks = { ...checks }
      for (const name of failing) {
        const retriedCheck = retried[name]
        if (retriedCheck) finalChecks[name] = { ...retriedCheck, attempts: 2 }
      }
      return { checks: finalChecks, correctedFields }
    }),
  )
}
