// Who is talking. Genie runs as its own service and imports nothing from
// Bulbord, so it checks a member's sign-in the way any outside client would:
// by asking Bulbord's public API (`GET /auth/me`) with the same bearer token.
// Only an approved member may talk; anyone may watch.
interface Member {
  id: string
}

export type VerifyMember = (token: string) => Promise<Member | 'pending' | null>

const CACHE_MS = 5 * 60 * 1000
const MAX_CACHE = 500

export function bulbordMemberVerifier(apiUrl: string, fetchImpl: typeof fetch = fetch): VerifyMember {
  const cache = new Map<string, { result: Member | 'pending' | null; at: number }>()
  return async (token) => {
    const hit = cache.get(token)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.result
    const res = await fetchImpl(`${apiUrl}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    let result: Member | 'pending' | null = null
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: unknown; approved?: unknown } }
      const id = body.data?.id
      if (typeof id === 'string') result = body.data?.approved === true ? { id } : 'pending'
    } else if (res.status !== 401 && res.status !== 403) {
      // Bulbord itself is having trouble: don't cache, let the caller fail.
      throw new Error(`Bulbord /auth/me answered ${res.status}`)
    }
    if (cache.size >= MAX_CACHE) cache.clear()
    cache.set(token, { result, at: Date.now() })
    return result
  }
}
