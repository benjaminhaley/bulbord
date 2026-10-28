import { getAnthropicClient } from '../claude.js'
import { TOPIC_OPTIONS } from './extraction-shared.js'

// Sourced events never got a topic (2026-10-28: 55 of the upcoming ones had
// none), so the Topic filter hid most of them. Each new event is now
// classified once at ingest, like simplifyTitle().
const SYSTEM_PROMPT = `You assign a topic to an event for a family events app. Pick the single best match from this fixed list: ${JSON.stringify(TOPIC_OPTIONS)}.

- "Volunteering": the event is a chance to volunteer or give — serving or packing meals, a food/clothing/toy drive, a blood drive, a pantry shift, a park or beach cleanup, a stewardship workday.
- If none clearly applies, answer "none".

Respond with ONLY the topic exactly as written in the list, or "none".`

export async function classifyTopic(input: { title: string; description?: string | null; locationName?: string | null }): Promise<string | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 60,
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ title: input.title, description: input.description ?? null, location_name: input.locationName ?? null }) }],
    })
    const block = response.content.find((b) => b.type === 'text')
    const answer = block?.type === 'text' ? block.text.trim().replace(/^"|"$/g, '') : ''
    return TOPIC_OPTIONS.find((t) => t.toLowerCase() === answer.toLowerCase()) ?? null
  } catch {
    // Best-effort — an event with no topic is still listed.
    return null
  }
}
