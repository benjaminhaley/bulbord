// Pure, unit-tested duplicate-detection logic, split out of ingest.ts the
// same way camps/grouping.ts keeps testable logic
// out of DB plumbing (CLAUDE.md's own convention for this codebase).
//
// Added 2026-09-04 (feedback #137): ingestEvents()'s existing dedup key
// (exact title + start_date + source_url) only ever caught a source
// re-scraping its own already-ingested page — it had no way to notice that
// two *different* sources describe the same real-world event under a
// slightly different title (e.g. "Lowline Market" from a generic chamber
// calendar vs. "Low-Line Market at Southport" from that market's own
// dedicated source, or "Yard Sale" vs. "Southport Neighbors Yard Sale").
// This adds a second, fuzzier check across the whole table for that date,
// independent of source_url.

export interface ExistingEventForDedup {
  id: string
  title: string
  address: string | null
  // Chicago wall-clock start, "HH:MM" or "HH:MM:SS"; null for all-day.
  startTime?: string | null
}

// Squashing to bare alphanumerics (no spaces, no punctuation, lowercased)
// deliberately collapses exactly the kind of surface variance seen in
// practice — "Low-Line Market" vs "Lowline Market" differ only in a hyphen
// and a space, which a plain word-overlap comparison wouldn't reliably
// treat as the same word at all.
function squash(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Below this length, a squashed title is too generic on its own to safely
// treat containment as evidence of a real duplicate (a short, common word
// like "Karaoke" could coincidentally appear as a whole title for two
// genuinely unrelated events) — real cross-source duplicates in practice
// have had much more specific, distinctive titles than this.
const MIN_SQUASHED_LENGTH_FOR_CONTAINMENT = 8

// Two titles are a likely duplicate when one, once squashed, is fully
// contained in the other — the shape every real cross-source duplicate
// found so far has taken: a dedicated source's fuller/more specific name
// contains a generic calendar's terser name for the same real event (or
// they're simply identical). Deliberately NOT a word-overlap ratio: that
// approach flags "Movie Night: National Treasure" against "Movie Night:
// Beethoven" as ~67% similar (they share "Movie" and "Night"), which is
// exactly backwards — those are genuinely different occurrences of the same
// template title. A substring check only matches when the *entire* shorter
// title's content actually reappears in the longer one, which the two movie
// nights' own distinct back halves prevent.
function titlesLikelyMatch(a: string, b: string): boolean {
  const squashedA = squash(a)
  const squashedB = squash(b)
  if (squashedA.length < MIN_SQUASHED_LENGTH_FOR_CONTAINMENT || squashedB.length < MIN_SQUASHED_LENGTH_FOR_CONTAINMENT) {
    return false
  }
  return squashedA.includes(squashedB) || squashedB.includes(squashedA)
}

// Spelling differences that don't change the place: "&" vs "and", "St." vs
// "Street", a ZIP present on one side only (2026-10-28: "Addison St. and
// DuSable Lake Shore Dr." vs "Addison St & DuSable Lake Shore Dr, 60613").
const ADDRESS_WORDS: Record<string, string> = {
  '&': 'and', street: 'st', avenue: 'ave', drive: 'dr', road: 'rd', boulevard: 'blvd', place: 'pl',
  north: 'n', south: 's', east: 'e', west: 'w', illinois: 'il',
}

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/&/g, ' & ')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d{5}$/.test(w) && w !== 'usa')
    .map((w) => ADDRESS_WORDS[w] ?? w)
    .join(' ')
}

// A missing address on either side is never treated as a signal that two
// same-titled, same-day listings are different real places — several real
// cross-source duplicates (a generic chamber calendar scrape) never carry an
// address at all, while the dedicated source for the same real event does.
// Only two genuinely different, *present* addresses should override a title
// match — the case this exists to protect is Chicago DOT's several real,
// distinct same-day block party permits, which do always carry their own
// real (and different) addresses.
function addressesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true
  const normA = normalizeAddress(a)
  const normB = normalizeAddress(b)
  return normA === normB || normA.includes(normB) || normB.includes(normA)
}

// Words too common to say two listings are the same event on their own.
const GENERIC_WORDS = new Set([
  'event', 'events', 'family', 'families', 'community', 'night', 'kids', 'children', 'meeting', 'workshop', 'class', 'classes',
  'open', 'house', 'celebration', 'party', 'festival', 'music', 'movie', 'story', 'holiday', 'halloween', 'thanksgiving',
  'christmas', 'annual', 'free', 'chicago', 'lakeview', 'program', 'session', 'series', 'presents',
])

// The words that name *this* listing: the part after a series prefix
// ("Music Box of Horrors: Deathbed Visions" -> "Deathbed Visions"), so two
// different films in one series never match on the series' own name.
function distinctiveWords(title: string): Set<string> {
  const ownPart = title.includes(':') ? title.slice(title.lastIndexOf(':') + 1) : title
  return new Set(
    ownPart
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5 && !GENERIC_WORDS.has(w)),
  )
}

// The second shape (2026-10-28): two listings of one event that start at the
// same minute, at a compatible place, and share a distinctive word, though
// neither title contains the other — "Community Stewardship Day" vs "Bird
// Sanctuary Stewardship Day", "Lakeview East Kidical Mass" vs "Kidical Mass
// Halloween Ride", "Horror of Dracula" vs "Dracula aka Horror of Dracula".
// Requires a real start time on both, so all-day listings never match this way.
function sameSlotAndSharedWord(
  candidate: { title: string; startTime?: string | null },
  row: ExistingEventForDedup,
): boolean {
  if (!candidate.startTime || !row.startTime || candidate.startTime.slice(0, 5) !== row.startTime.slice(0, 5)) return false
  const rowWords = distinctiveWords(row.title)
  return [...distinctiveWords(candidate.title)].some((w) => rowWords.has(w))
}

// Checks a candidate (about to be inserted) against every other approved
// event already on the same date, returning the first one it looks like a
// duplicate of, or null. The caller is expected to have already scoped
// `existing` to the candidate's own start_date.
export function findLikelyDuplicateEvent(
  candidate: { title: string; address?: string | null; startTime?: string | null },
  existing: ExistingEventForDedup[],
): ExistingEventForDedup | null {
  for (const row of existing) {
    if (!addressesCompatible(candidate.address ?? null, row.address)) continue
    if (titlesLikelyMatch(candidate.title, row.title) || sameSlotAndSharedWord(candidate, row)) {
      return row
    }
  }
  return null
}
