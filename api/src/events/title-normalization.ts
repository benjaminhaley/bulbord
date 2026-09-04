import { getAnthropicClient } from '../claude.js'

const SYSTEM_PROMPT = `You rewrite scraped event titles for a family events app so they read as short, plain listings instead of verbose scraped text.

Rules:
- Drop sponsor/corporate branding (e.g. "Toyota Movie Nights" -> "Movie Night"). Sponsor names are noise, not identity, and rotate over time.
- Drop venue/address text from the title when it duplicates the given location_name — that's already shown as its own line under the title, so repeating it is pure redundancy.
- Drop qualifier words that don't help identify this specific occurrence (e.g. "Quarterly", "Neighborhood" when the org name already implies it).
- Keep: a recurring series' brand name (so people recognize it across occurrences, e.g. "Indoor Kids"), the specific differentiator for this occurrence (a movie title, a workshop topic), and any festival/org name people would actually search by.
- Target roughly 30-35 characters where the content allows it, but never mangle a real name just to hit a length.
- If the title is already short and pointed, return it completely unchanged.

Respond with ONLY the rewritten title, no quotes, no explanation.`

export async function simplifyTitle(input: {
  title: string
  description?: string | null
  locationName?: string | null
}): Promise<string> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return input.title

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      // Bumped from 60 (2026-09-03, found via a real incident — see below):
      // 60 was tight enough that an occasional response starting with even
      // a few words of commentary before the actual title (despite the
      // system prompt's "ONLY the rewritten title, no explanation") could
      // run out of budget mid-word, and the code below used to trust
      // whatever partial text came back. 120 gives real headroom without
      // meaningfully increasing cost for what's still a short-output task.
      max_tokens: 120,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            title: input.title,
            description: input.description ?? null,
            location_name: input.locationName ?? null,
          }),
        },
      ],
    })

    if (response.stop_reason === 'refusal') return input.title
    // A real incident (2026-09-03): a max_tokens-truncated response was
    // trusted as-is, producing garbled fragment titles ("N", "No",
    // "Nettel") that then landed as real events. A truncated response is
    // never safe to use — the original, unsimplified title is always a
    // better fallback than a cut-off partial string.
    if (response.stop_reason === 'max_tokens') return input.title
    const block = response.content.find((b) => b.type === 'text')
    const simplified = block?.type === 'text' ? block.text.trim() : ''
    return simplified || input.title
  } catch {
    // Best-effort — never block ingestion on this, same spirit as
    // image-enrichment.ts's "leave it null" fallback on extraction failure.
    return input.title
  }
}
