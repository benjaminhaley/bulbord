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

// One Messages call that uses server tools (web_search/web_fetch): such a
// turn can pause mid-way (stop_reason "pause_turn"), and resuming is just
// re-sending the conversation with the paused turn appended. Returns the
// final message, or null when the call itself failed.
const MAX_SERVER_TOOL_CONTINUATIONS = 3

export async function createWithServerTools(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'messages'> & { messages: Anthropic.MessageParam[] },
  timeoutMs: number,
): Promise<Anthropic.Message | null> {
  const anthropic = getAnthropicClient()
  if (!anthropic) return null
  const messages = [...params.messages]
  let message: Anthropic.Message | null = null
  for (let i = 0; i <= MAX_SERVER_TOOL_CONTINUATIONS; i++) {
    message = await anthropic.messages.create({ ...params, messages }, { timeout: timeoutMs, maxRetries: 1 })
    if (message.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: message.content })
  }
  return message
}

// The final text block of a (possibly tool-using) response, parsed as JSON —
// tolerating a sentence of preamble or a code fence around it. Null when
// there's no text or it doesn't parse.
export function parseFinalJson(message: Anthropic.Message, shape: 'object' | 'array'): unknown {
  const block = [...message.content].reverse().find((b) => b.type === 'text')
  const raw = block?.type === 'text' ? block.text.trim() : ''
  if (!raw) return null
  const [open, close] = shape === 'object' ? ['{', '}'] : ['[', ']']
  const start = raw.indexOf(open)
  const end = raw.lastIndexOf(close)
  try {
    return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : stripJsonCodeFence(raw))
  } catch {
    return null
  }
}
