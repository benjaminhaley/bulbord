import Anthropic from '@anthropic-ai/sdk'

// Shared by every Claude-backed feature in this codebase (title-normalization.ts,
// resourcing.ts, events/photo-extraction.ts) — lazily constructed rather than
// module-load-eager (unlike newsletter/mailer.ts's requireEnv pattern) since
// each caller is on a critical path that must degrade to "skip this optional
// step" when ANTHROPIC_API_KEY is unset, not crash the whole server boot.
let client: Anthropic | null | undefined
export function getAnthropicClient(): Anthropic | null {
  if (client === undefined) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    client = apiKey ? new Anthropic({ apiKey }) : null
  }
  return client
}

// Claude's JSON-extraction responses sometimes wrap the JSON in a markdown
// code fence despite being asked not to — strip it before JSON.parse.
export function stripJsonCodeFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return match ? match[1] : text
}
