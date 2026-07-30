import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

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

  async function refresh() {
    setIsLoading(true)
    try {
      setUser(await fetchCurrentUser())
    } finally {
      setIsLoading(false)
    }
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  useEffect(() => {
    refresh()
  }, [])

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
