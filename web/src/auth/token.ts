const STORAGE_KEY = 'bulbord_session_token'

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Pulls a bearer token out of either a pasted full sign-in link
// (https://.../?signInToken=<token>) or a bare token typed/pasted on its
// own — used by JoinGate's manual sign-in fallback for anyone who can't rely
// on a tapped link handing off to the app (see JoinGate.tsx's
// ManualSignInEntry for why that hand-off isn't reliable enough to be the
// only path in, most notably for an App Store reviewer).
export function parseSignInToken(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const token = new URL(trimmed).searchParams.get('signInToken')
    if (token) return token
  } catch {
    // Not a full URL -- fall through to the regex/bare-token handling below.
  }
  const match = trimmed.match(/signInToken=([^&\s]+)/)
  return match ? match[1] : trimmed
}
