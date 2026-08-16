import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { track } from '../analytics/api'
import { fetchCurrentUser, logout as apiLogout, type CurrentUser } from './api'

interface AuthState {
  user: CurrentUser | null
  isLoading: boolean
  isAdmin: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const trackedAppOpen = useRef(false)

  // `isLoading` gates JoinGate's whole-app spinner (see JoinGate.tsx) — only
  // meaningful while we don't yet know who's signed in (true app boot, or
  // right after registering/logging in, before `user` exists). A background
  // refresh of an *already-known* user (e.g. FriendsPage marking the friend
  // badge seen) must never touch it: doing so was a real bug (2026-08-16) —
  // toggling isLoading unmounted the entire app including whatever page
  // called refresh(), and if that page's own mount effect called refresh()
  // again (FriendsPage's did, for exactly this reason), the remount
  // re-triggered it, forever — an infinite unmount/remount loop that ended
  // with the user logged out once a request in the storm happened to 401.
  async function refresh() {
    const isInitialLoad = user === null
    if (isInitialLoad) setIsLoading(true)
    try {
      setUser(await fetchCurrentUser())
    } finally {
      if (isInitialLoad) setIsLoading(false)
    }
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  useEffect(() => {
    refresh()
    // Intentionally run once at mount only — `refresh` is redefined every
    // render (it closes over `user`), so listing it here would re-run this
    // on every render instead of just once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Feedback #96's "daily active visitors" — once per app session, the
  // first time a real signed-in user is resolved (the server dedupes this
  // to once per member per Chicago calendar day, so a page reload firing it
  // again is harmless, just wasted).
  useEffect(() => {
    if (user && !trackedAppOpen.current) {
      trackedAppOpen.current = true
      track('app_opened').catch(() => {})
    }
  }, [user])

  const isAdmin = user?.roles.includes('admin') ?? false

  return <AuthContext.Provider value={{ user, isLoading, isAdmin, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
