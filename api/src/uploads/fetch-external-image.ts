import { fetchWithTimeout } from './fetch-with-timeout.js'

const MAX_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000

// Used for pulling og:image URLs from source event pages — untrusted input,
// so bounded by size/timeout and restricted to image content-types.
export async function fetchExternalImage(url: string): Promise<Buffer | null> {
  const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  if (!response || !response.ok) return null

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) return null

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BYTES) return null

  try {
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.byteLength > MAX_BYTES ? null : buffer
  } catch {
    return null
  }
}
