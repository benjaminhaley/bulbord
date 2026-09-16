// Feedback #169 (2026-09-16): found while investigating "unacceptable image
// quality" that ~80% of Wikimedia Commons image downloads (image-quality.ts's
// own imageTraces logged "download_failed" for them, with no status code
// kept to say why) were failing in production, though the exact same URLs
// fetched fine from elsewhere — Node's fetch (undici) sends no User-Agent at
// all by default, and Wikimedia's stated User-Agent policy
// (meta.wikimedia.org/wiki/User-Agent_policy) explicitly rate-limits/blocks
// anonymous-looking traffic from datacenter IP ranges harder than requests
// that identify themselves. A real, descriptive UA is cheap insurance here
// and for every other site this helper fetches (a source page's own image
// candidates, a broader-search result page) — plenty of servers apply the
// same generic-bot suspicion to a UA-less request.
const USER_AGENT = 'Bulbord/1.0 (+https://bulbord.com; family-community-events-app)'

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT } })
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
