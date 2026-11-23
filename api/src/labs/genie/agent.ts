import Anthropic from '@anthropic-ai/sdk'

// Genie's three Claude calls:
// 1. The gate (fast, cheap): the mic hears everything, so every finished
//    phrase is first judged "is someone asking Genie for something?", given the
//    few phrases just before it (speech recognition splits a sentence at
//    pauses), and if so, what the whole request is.
// 2. The sketch (fast, cheap): a tiny first glimpse of the wish, on screen a
//    few seconds after it's heard, while the genie builds the real thing.
// 3. The genie: rewrites the shared page for the request(s), as one complete
//    HTML document. The page runs in a sandboxed iframe (see the page's
//    sandboxedDocument), so whatever it writes can't reach Bulbord or any
//    server: it's only ever a client-side page.

interface GateResult {
  request: string | null // the whole request, or null for chatter
}

export interface MadePage {
  html: string
  title: string
}

export interface GenieAgent {
  gate(input: { phrase: string; recent: string[]; showing: string }): Promise<GateResult>
  sketch(input: { requests: string[]; showing: string }, signal: AbortSignal): Promise<MadePage | null>
  makePage(input: { requests: string[]; currentHtml: string | null }, onProgress: (chars: number) => void, signal: AbortSignal): Promise<MadePage | null>
}

const GATE_MODEL = 'claude-haiku-5-5'
const SKETCH_MODEL = 'claude-haiku-5-5'
const GENIE_MODEL = 'claude-opus-5-5'
const MAX_CURRENT_HTML = 200_000

// Mirrors the page's CSP and storage shim (web/public/labs/genie/index.html).
const SANDBOX_RULES = `The page runs in a locked-down sandbox. It is only ever a client-side page: there is no backend, and nothing it does can change anything on any server.
- Inline scripts and styles work. External scripts, styles and fonts load only from https://cdnjs.cloudflare.com, https://cdn.jsdelivr.net and https://unpkg.com. Images may come from https:, data: or blob: URLs.
- fetch() reaches only these read-only public data APIs: https://api.open-meteo.com, https://geocoding-api.open-meteo.com, https://air-quality-api.open-meteo.com and https://en.wikipedia.org (add origin=* to Wikipedia API calls). Everything else is blocked.
- localStorage works and stays on the viewer's own device (each person watching has their own); use getItem/setItem/removeItem only, never property access. Good for high scores and settings. sessionStorage works for this visit only. No IndexedDB or cookies.
- No popups, alerts, forms that submit, navigating away, microphone or camera.
- Sound must start from a tap or key press (browsers block autoplay); speechSynthesis is fine after one.`

const GATE_SYSTEM = `You listen to everything said near a shared screen called Genie, through a microphone that is always on. People ask Genie to show, play, draw, animate, look up, change or undo things on the screen, often without saying "Genie". Most of what you hear is NOT for Genie: people talking to each other, half sentences, filler, sounds from the screen itself (game noises, text being read aloud), or speech-recognition garbage.

Given the newest phrase, the phrases heard just before it (oldest first, from the same microphone), and what the screen shows now, decide whether the newest phrase completes a request to Genie.
- If it does, set "request" to the whole request in plain words, joining earlier fragments that belong to it and fixing obvious mis-hearings ("hackman" -> "Pac-Man"). A question someone clearly wants answered on the screen ("what's the weather") counts.
- If it doesn't, or you're unsure, set "request" to null. Asking too often is worse than missing one: people can repeat themselves.`

const SKETCH_SYSTEM = `You are the quick hands of Genie, a shared screen that people talk to. A slower, better genie is already building the full answer to the wish below; your job is the first glimpse, on screen within seconds, so it feels like Genie started conjuring the instant it heard.

Answer with ONE small, complete HTML document (starting with <!doctype html>, with a short <title>) and nothing else. Keep it tiny (under 60 lines) and write it straight away, without planning: speed matters more than polish. It fills the whole viewport and works on a phone held upright.

Make a charming, rough first take of the actual wish, not a loading screen: a simple SVG sketch of the picture, a game's title card with its hero drawn and moving, the answer to a question if you know it (with a "getting the details" hint for live data), a few words appearing in the style asked for. Vary your approach and style every time: surprise people. A little gentle animation is good.

If the wish is a small change to what's already showing (a color, a speed, a tweak) rather than something new, answer exactly SKIP.

${SANDBOX_RULES}

Everyone here is a member of a school community, kids included: keep it family-friendly, and if the wish isn't, answer SKIP.`

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
- A question ("what's the weather", "how far is the moon"): show the answer as a clear, good-looking display. For live data, fetch it from the page at runtime from one of the allowed APIs below; for weather use Open-Meteo (https://api.open-meteo.com/v1/forecast), defaulting to Chicago's Lakeview neighborhood (latitude 41.94, longitude -87.645) and Fahrenheit. You may also use web search for facts you need while writing the page.
- While you write, a quick rough sketch of this request may be on screen; ignore it and build the real thing from the page described below.
- A change to what's showing ("make the ghosts faster", "now make it purple"): change the current page and keep everything else about it.
- A request to start over or clear the screen: a calm, simple "Genie is listening" page.

${SANDBOX_RULES}

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

    async sketch({ requests, showing }, signal) {
      const message = await client.messages.create(
        {
          model: SKETCH_MODEL,
          max_tokens: 4000,
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: SKETCH_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages: [
            {
              role: 'user',
              content: `Screen now shows: ${showing || 'the "Genie is listening" start page'}\nThe wish: ${requests.join(' / ')}`,
            },
          ],
        },
        { timeout: 60_000, maxRetries: 0, signal },
      )
      if (message.stop_reason !== 'end_turn') return null
      const text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      return extractPage(text)
    },

    async makePage({ requests, currentHtml }, onProgress, signal) {
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
          { timeout: 10 * 60_000, maxRetries: 1, signal },
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
