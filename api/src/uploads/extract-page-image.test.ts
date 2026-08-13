import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchWithTimeoutMock = vi.fn()

vi.mock('./fetch-with-timeout.js', () => ({ fetchWithTimeout: fetchWithTimeoutMock }))

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
})
