import { existsSync } from 'node:fs'

// A real headless Chromium for pages whose content is built by JavaScript
// (2026-09-27: Chicago Growth Project's events page is an empty app shell,
// Chicago Kids loads its calendar client-side — a plain fetch sees neither).
// Used by resourcing.ts's fetchPageText as a fallback, never as the default:
// a rendered page differs slightly on every load, which would defeat the
// unchanged-page hash skip that keeps re-extraction from creating duplicates.
//
// Production: Chromium comes from Debian's `chromium` package, installed into
// the api and event-sourcing-cron images via the RAILPACK_DEPLOY_APT_PACKAGES
// service variable. Locally: set CHROMIUM_PATH, or let playwright-core use
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

// The page's HTML after JavaScript has run, or null on any failure (no
// browser installed, navigation error, timeout) — callers treat null the same
// as an unreadable page. Launches a fresh browser per render and always
// closes it, so nothing lingers in the long-running api process.
export async function renderPageHtml(url: string): Promise<string | null> {
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
      const page = await browser.newPage({ userAgent: USER_AGENT })
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: RENDER_TIMEOUT_MS })
      if (response && !response.ok()) return null
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_WAIT_MS }).catch(() => {})
      return await page.content()
    } catch (err) {
      console.warn(`renderPageHtml failed for ${url}:`, err instanceof Error ? err.message : err)
      return null
    } finally {
      await browser?.close().catch(() => {})
    }
  })
}
