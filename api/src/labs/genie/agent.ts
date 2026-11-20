import Anthropic from '@anthropic-ai/sdk'

// Genie's two Claude calls:
// 1. The gate (fast, cheap): the mic hears everything, so every finished
//    phrase is first judged "is someone asking Genie for something?", given the
//    few phrases just before it (speech recognition splits a sentence at
//    pauses), and if so, what the whole request is.
// 2. The genie: rewrites the shared page for the request(s), as one complete
//    HTML document. The page runs in a sandboxed iframe (see the page's
//    sandboxedDocument), so whatever it writes can't reach Bulbord.

interface GateResult {
  request: string | null // the whole request, or null for chatter
}

export interface MadePage {
  html: string
  title: string
}

export interface GenieAgent {
  gate(input: { phrase: string; recent: string[]; showing: string }): Promise<GateResult>
  makePage(input: { requests: string[]; currentHtml: string | null }, onProgress: (chars: number) => void): Promise<MadePage | null>
}

const GATE_MODEL = 'claude-haiku-5-5'
const GENIE_MODEL = 'claude-opus-5-5'
const MAX_CURRENT_HTML = 200_000

const GATE_SYSTEM = `You listen to everything said near a shared screen called Genie, through a microphone that is always on. People ask Genie to show, play, draw, animate, look up, change or undo things on the screen, often without saying "Genie". Most of what you hear is NOT for Genie: people talking to each other, half sentences, filler, sounds from the screen itself (game noises, text being read aloud), or speech-recognition garbage.

Given the newest phrase, the phrases heard just before it (oldest first, from the same microphone), and what the screen shows now, decide whether the newest phrase completes a request to Genie.
- If it does, set "request" to the whole request in plain words, joining earlier fragments that belong to it and fixing obvious mis-hearings ("hackman" -> "Pac-Man"). A question someone clearly wants answered on the screen ("what's the weather") counts.
- If it doesn't, or you're unsure, set "request" to null. Asking too often is worse than missing one: people can repeat themselves.`

const GATE_SCHEMA = {
  type: 'object',
  properties: { request: { type: ['string', 'null'] } },
  required: ['request'],
  additionalProperties: false,
}

const GENIE_SYSTEM = `You are Genie: a shared screen that people talk to. Whatever they ask for appears on the screen, which is one web page that you write. Everyone watching sees the same page, and you only ever see the page that is showing now and the latest request(s).

Answer with ONE complete HTML document (starting with <!doctype html>, with a short <title> naming what's on screen) and nothing else: no explanation, no code fence. If the requests genuinely need no change, answer exactly NO_CHANGE.

What to make:
- Fill the whole viewport (100vw x 100vh, no page scroll unless the content is long text) and work on a phone held upright (as narrow as 360px) and on a big screen. Every word must fit on screen: size headings with clamp()/vw units and let them wrap, never let text run off the edge. Make it look good: bold, clean, colorful where it fits.
- A game: playable right away with touch and with keyboard, with a score, and short on-screen instructions. Make your own original characters and art in the genre asked for (a maze chase, a block-stacking puzzle, a platformer). Don't copy a real game's name, characters, art, sounds or levels.
- A picture ("draw me an elephant juggling"): draw it yourself as detailed SVG or canvas art.
- A video or animation: an animated SVG or canvas scene that plays on its own and loops.
- A question ("what's the weather", "how far is the moon"): show the answer as a clear, good-looking display. For live data, fetch it from the page at runtime from a free public API that needs no key and allows any origin; for weather use Open-Meteo (https://api.open-meteo.com/v1/forecast), defaulting to Chicago's Lakeview neighborhood (latitude 41.94, longitude -87.645) and Fahrenheit. You may also use web search for facts you need while writing the page.
- A change to what's showing ("make the ghosts faster", "now make it purple"): change the current page and keep everything else about it.
- A request to start over or clear the screen: a calm, simple "Genie is listening" page.

The page runs in a locked-down sandbox:
- Inline scripts and styles work. External scripts, styles and fonts load only from https://cdnjs.cloudflare.com, https://cdn.jsdelivr.net and https://unpkg.com. fetch() works for public https APIs that allow any origin. Images may come from https:, data: or blob: URLs.
- There is no localStorage, sessionStorage, IndexedDB or cookies (accessing them throws), no popups, no alerts, no forms that submit, no navigating away, and no microphone or camera. Keep all state in memory.
- Sound must start from a tap or key press (browsers block autoplay); speechSynthesis is fine after one.

Everyone here is a member of a school community, kids included: keep everything family-friendly, and if a request isn't, show a friendly page saying Genie can't make that.`

export function claudeAgent(client: Anthropic, options: { effort?: 'low' | 'medium' | 'high'; fast?: boolean } = {}): GenieAgent {
  return {
    async gate({ phrase, recent, showing }) {
      const message = await client.messages.create(
        {
          model: GATE_MODEL,
          max_tokens: 2048,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: GATE_SCHEMA } },
          system: GATE_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Screen now shows: ${showing || 'the "Genie is listening" start page'}\nHeard just before (oldest first):\n${recent.map((r) => `- ${r}`).join('\n') || '(nothing)'}\nNewest phrase: ${phrase}`,
            },
          ],
        },
        { timeout: 30_000, maxRetries: 1 },
      )
      if (message.stop_reason !== 'end_turn') return { request: null }
      const text = message.content.find((b) => b.type === 'text')
      if (text?.type !== 'text') return { request: null }
      try {
        const parsed = JSON.parse(text.text) as { request?: unknown }
        const request = typeof parsed.request === 'string' ? parsed.request.trim() : ''
        return { request: request || null }
      } catch {
        return { request: null }
      }
    },

    async makePage({ requests, currentHtml }, onProgress) {
      const current = currentHtml ? currentHtml.slice(0, MAX_CURRENT_HTML) : null
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
          role: 'user',
          content: [
            current ? `The page showing now:\n<current_page>\n${current}\n</current_page>` : 'The screen shows the "Genie is listening" start page.',
            requests.length === 1
              ? `The request: ${requests[0]}`
              : `The requests, oldest first (do all that still make sense together; a later one wins over an earlier one):\n${requests.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
          ].join('\n\n'),
        },
      ]
      let final: Anthropic.Beta.BetaMessage | null = null
      let written = 0
      // A web search can pause the turn; resuming is re-sending it.
      for (let i = 0; i < 4; i++) {
        const stream = client.beta.messages.stream(
          {
            model: GENIE_MODEL,
            max_tokens: 64_000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            ...(options.fast ? { speed: 'fast' as const } : {}),
            output_config: { effort: options.effort ?? 'medium' },
            system: [{ type: 'text', text: GENIE_SYSTEM, cache_control: { type: 'ephemeral' } }],
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
            messages,
          },
          { timeout: 10 * 60_000, maxRetries: 1 },
        )
        stream.on('text', (delta) => {
          written += delta.length
          onProgress(written)
        })
        final = await stream.finalMessage()
        if (final.stop_reason !== 'pause_turn') break
        messages.push({ role: 'assistant', content: final.content })
      }
      if (!final || final.stop_reason === 'refusal' || final.stop_reason === 'max_tokens') return null
      const text = final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return extractPage(text)
    },
  }
}

// The HTML document in the genie's answer, or null for NO_CHANGE / no document.
export function extractPage(text: string): MadePage | null {
  const start = text.search(/<!doctype html|<html[\s>]/i)
  const end = text.toLowerCase().lastIndexOf('</html>')
  if (start < 0 || end < start) return null
  const html = text.slice(start, end + '</html>'.length)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  return { html, title: title.slice(0, 120) }
}
