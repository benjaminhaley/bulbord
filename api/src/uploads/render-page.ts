import { existsSync } from 'node:fs'

// A real headless Chromium for pages whose content is built by JavaScript
// (2026-09-27: Chicago Growth Project's events page is an empty app shell,
// Chicago Kids loads its calendar client-side — a plain fetch sees neither).
// Used by resourcing.ts's fetchPageText as a fallback, never as the default:
// a rendered page differs slightly on every load, which would defeat the
// unchanged-page hash skip that keeps re-extraction from creating duplicates.
//
// Production: Chromium comes from Debian's `chromium` package, installed in
// api/Dockerfile (the one image the api and all three cron services run). Locally: set CHROMIUM_PATH, or let playwright-core use
// the browser `npx playwright install chromium` already put in its cache.

const RENDER_TIMEOUT_MS = 25_000
// After the DOM is ready, give client-side fetches this long to settle.
const NETWORK_IDLE_WAIT_MS = 8_000
// Each Chromium costs a few hundred MB; the batch run checks 3 sources at once.
const MAX_CONCURRENT_RENDERS = 2
const DEBIAN_CHROMIUM = '/usr/bin/chromium'

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Bulbord/1.0 (+https://bulbord.com)'

let active = 0
const waiting: (() => void)[] = []

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_RENDERS) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

function executablePath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  return existsSync(DEBIAN_CHROMIUM) ? DEBIAN_CHROMIUM : undefined
}

// A short, readable cause for a failed render, for the Sources/Pipeline
// Review failure lists (feedback #182: "figure out what's going wrong").
function describeRenderError(message: string): string {
  if (/ERR_CERT|SSL|certificate/i.test(message)) return "the site's security certificate is invalid"
  if (/Timeout|timed out/i.test(message)) return 'the page took too long to load'
  if (/ERR_NAME_NOT_RESOLVED/.test(message)) return "the site's domain doesn't resolve"
  if (/ERR_CONNECTION|ERR_EMPTY_RESPONSE|ECONNREFUSED|ECONNRESET/.test(message)) return 'the site refused the connection'
  if (/Executable doesn't exist|executable/i.test(message)) return 'no headless browser is installed'
  return message.split('\n')[0].slice(0, 160)
}

// The page's HTML after JavaScript has run, or null on any failure (no
// browser installed, navigation error, timeout) — callers treat null the same
// as an unreadable page, and `failures` (when given) gets a readable cause.
// Launches a fresh browser per render and always closes it, so nothing
// lingers in the long-running api process.
export async function renderPageHtml(url: string, failures?: string[]): Promise<string | null> {
  return withRenderSlot(async () => {
    let browser: import('playwright-core').Browser | null = null
    try {
      // Imported lazily so loading this module never requires Chromium.
      const { chromium } = await import('playwright-core')
      browser = await chromium.launch({
        executablePath: executablePath(),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: RENDER_TIMEOUT_MS,
      })
      // ignoreHTTPSErrors: we only read a public listing's text, so an
      // expired certificate isn't a reason to give up on it (2026-10-14:
      // Chicago Kids' certificate lapsed for a few hours over a weekly run).
      const page = await browser.newPage({ userAgent: USER_AGENT, ignoreHTTPSErrors: true })
      // The status of the last top-level document load. A bot check (Sucuri,
      // Cloudflare) answers the first request with a 3xx/403/503 challenge
      // page whose JavaScript then reloads the real page — so the first
      // response alone can't say whether the page is readable (2026-10-14:
      // Music Box Theatre's 307 challenge was treated as a failure).
      let lastDocumentStatus = 0
      page.on('response', (response) => {
        if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) lastDocumentStatus = response.status()
      })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_WAIT_MS }).catch(() => {})
      if (lastDocumentStatus >= 300) {
        // Still on the challenge: give its reload one more chance to land.
        await page.waitForLoadState('load', { timeout: NETWORK_IDLE_WAIT_MS }).catch(() => {})
        await page.waitForTimeout(3000)
        if (lastDocumentStatus >= 300) {
          failures?.push(
            [401, 403, 429, 503].includes(lastDocumentStatus) || lastDocumentStatus < 400
              ? `the site's bot protection blocked the headless browser (HTTP ${lastDocumentStatus})`
              : `the browser got HTTP ${lastDocumentStatus}`,
          )
          return null
        }
      }
      return await page.content()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`renderPageHtml failed for ${url}:`, message)
      failures?.push(describeRenderError(message))
      return null
    } finally {
      await browser?.close().catch(() => {})
    }
  })
}
