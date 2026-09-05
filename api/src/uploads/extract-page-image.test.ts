import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithTimeoutMock = vi.fn()

vi.mock('./fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

function htmlResponse(html: string) {
  return {
    ok: true,
    headers: { get: () => 'text/html' },
    text: async () => html,
  }
}

const PAGE_URL = 'https://chipublib.bibliocommons.com/events/back-to-school-clothing-swap'

describe('extractPageImageCandidates', () => {
  beforeEach(() => {
    fetchWithTimeoutMock.mockReset()
  })

  it('skips an unrendered template placeholder in a header <img> and falls through to a real logo further down', async () => {
    // Reproduces the real BiblioCommons event page that shipped with no
    // image: its header's first <img> is a personalization stub
    // (`{{user_avatar}}`) that never got server-rendered, with a real
    // library logo two images later in the same header.
    fetchWithTimeoutMock.mockResolvedValue(
      htmlResponse(`
        <html><body>
          <header>
            <img src="{{user_avatar}}" class="img-circle" alt="">
            <img alt="Chicago Public Library" src="//cdn.example.com/logo.png" />
          </header>
        </body></html>
      `),
    )

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(PAGE_URL)

    expect(candidates).toEqual([{ url: 'https://cdn.example.com/logo.png', isLogo: true }])
  })

  it('skips a UI loading-spinner graphic in the header and falls through to a real logo', async () => {
    // Real incident, 2026-09-05: gallagherway.com/img/loader.gif — a
    // 110x130 JS loading spinner shown before the page's real lazy-loaded
    // images finish loading — was picked up as "the site logo," passed the
    // loose logo-size gate, and (being isLogo: true) skipped content-
    // relevance scoring entirely, ending up as several events' actual image.
    fetchWithTimeoutMock.mockResolvedValue(
      htmlResponse(`
        <html><body>
          <header>
            <img src="/img/loader.gif" alt="">
            <img alt="Gallagher Way" src="//cdn.example.com/gallagher-logo.png" />
          </header>
        </body></html>
      `),
    )

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(PAGE_URL)

    expect(candidates).toEqual([{ url: 'https://cdn.example.com/gallagher-logo.png', isLogo: true }])
  })

  it('returns no candidates when every header image is an unrendered template placeholder', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      htmlResponse(`<html><body><header><img src="{{user_avatar}}"></header></body></html>`),
    )

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(PAGE_URL)

    expect(candidates).toEqual([])
  })

  it('ignores a template placeholder in an og:image meta tag too', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      htmlResponse(`
        <html><head><meta property="og:image" content="{{share_image}}"></head>
        <body><header><img src="https://cdn.example.com/real-logo.png"></header></body></html>
      `),
    )

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(PAGE_URL)

    expect(candidates).toEqual([{ url: 'https://cdn.example.com/real-logo.png', isLogo: true }])
  })

  it('marks a real og:image candidate as not a logo', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      htmlResponse(`<html><head><meta property="og:image" content="https://cdn.example.com/hero.jpg"></head></html>`),
    )

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(PAGE_URL)

    expect(candidates).toEqual([{ url: 'https://cdn.example.com/hero.jpg', isLogo: false }])
  })

  // Regression fixture: the actual raw HTML fetched from the real
  // BiblioCommons "Back to School Clothing Swap" event page that shipped
  // with no image (feedback, 2026-08-13). Committed verbatim rather than a
  // hand-simplified mock, so a future change to the extraction logic (a
  // tweaked SKIP_SRC_PATTERN, a different contentRoot heuristic, etc.) gets
  // caught against the real messy markup that broke, not just against a
  // synthetic HTML snippet shaped to pass. If this ever starts failing
  // because BiblioCommons changed their markup, re-fetch the fixture from a
  // live chipublib.bibliocommons.com event page rather than loosening the
  // assertion.
  it('finds the real CPL logo on the actual BiblioCommons page that shipped with no image', async () => {
    const realHtml = readFileSync(join(FIXTURES_DIR, 'bibliocommons-event-page.html'), 'utf-8')
    fetchWithTimeoutMock.mockResolvedValue(htmlResponse(realHtml))

    const { extractPageImageCandidates } = await import('./extract-page-image.js')
    const candidates = await extractPageImageCandidates(
      'https://chipublib.bibliocommons.com/events/6a5f8dee7b79214226aa1756',
    )

    expect(candidates).not.toHaveLength(0)
    expect(candidates.every((c) => !c.url.includes('{{'))).toBe(true)
    expect(candidates).toContainEqual({
      url: 'https://cor-liv-cdn-static.bibliocommons.com/images/IL-CPL/logo.png?1786623505864',
      isLogo: true,
    })
  })
})
