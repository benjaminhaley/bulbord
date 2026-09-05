// Shared by every Claude-backed "turn member-supplied input into a real
// event, reviewed before posting" pipeline in this feature —
// photo-extraction.ts (feedback #93) and description-extraction.ts
// (feedback #133). Both are genuinely the same two-stage shape (a fast,
// non-search stage 1, then a slower web_search-backed stage 2) with only
// the *input* differing (an image vs. a typed description) — this file is
// where that shared scaffolding lives, so a third future on-ramp has
// somewhere to plug into instead of forking the timeout/deadline/JSON-
// parsing boilerplate a third time.

// Mirrors web/src/events/topics.ts's EVENT_TOPIC_OPTIONS, minus "Other"
// (which the model should just omit for rather than pick) — a small
// hardcoded literal here rather than a cross-package import, since there's
// no shared package between api/ and web/ (see CLAUDE.md's Newsletter "kept
// in sync" note) and topic is free text with no server-side enum to begin
// with.
export const TOPIC_OPTIONS = ['Movie Night', 'Sports & Fitness', 'Arts & Crafts', 'Community & Social']

// Real, per-request bounds on every Claude call these pipelines make —
// added 2026-08-23 after a real production request (photo-extraction's
// original stage 1) hung for 25+ minutes with no response and no error
// logged. Neither call had set an explicit timeout, so a slow/degraded
// upstream response fell back to the SDK's own default (10 min, retried up
// to 3 times — ~30 min worst case), wildly too long for a member sitting on
// a spinner. A short timeout + a single retry means a bad call fails fast
// (within ~1 minute) and the caller gets an honest "couldn't do this"
// result instead of an unbounded hang. STAGE_DEADLINE_MS is a hard backstop
// against a hang anywhere else in a stage-1 function (e.g. a slow stream
// read), not just inside the Anthropic call itself.
export const CALL_TIMEOUT_MS = 20_000
export const CALL_MAX_RETRIES = 1
export const STAGE_DEADLINE_MS = 45_000

// A web_search-backed stage 2 needs its own, much larger budget — its
// tool loop (server-side, up to 3 rounds) genuinely takes longer than a
// fast, non-search stage 1 call. Found by direct measurement (2026-08-23,
// on photo-extraction's original findEventSource: "why weren't additional
// details found online? They should be... can you debug and make this
// pipeline more reliable"): a real, correct answer routinely took 17-30s
// (up to 3 web_search_requests per call, per the response's own
// usage.server_tool_use), well past the *stage-1* timeout above — sharing
// one timeout was aborting a legitimately-still-working stage 2 request
// mid-search, then silently degrading to "not found" even though the model
// would have found the real answer given a few more seconds. Safe to size
// generously since stage 2 always runs in the background while the member
// reviews the form (see AddEventModal.tsx) — it never blocks Post, so a
// longer worst case here costs nothing in the UI.
export const SEARCH_CALL_TIMEOUT_MS = 60_000
export const SEARCH_CALL_MAX_RETRIES = 1
export const SEARCH_STAGE_DEADLINE_MS = 130_000

// Races `work` against a plain timer, resolving to `fallback` if the timer
// wins — the mechanism behind every stage's outer deadline above.
export async function withDeadline<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer!)
  }
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    return ['http:', 'https:'].includes(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

// The raw, untrusted shape either stage's JSON response is parsed into,
// before validation — every field `unknown` until checked. Stage 2 result
// shapes add their own `source_url`/`source_name` on top of this via an
// intersection at the call site, rather than this type carrying fields only
// one of the two stages ever produces.
export interface RawExtractedFields {
  found?: unknown
  title?: unknown
  description?: unknown
  start_date?: unknown
  start_time?: unknown
  end_time?: unknown
  all_day?: unknown
  address?: unknown
  location_name?: unknown
  source_url?: unknown
  topic?: unknown
}
