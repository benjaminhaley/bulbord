import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthContext'
import { fetchDataFreshness, type DataFreshness } from './api'

interface DataFreshnessState {
  freshness: DataFreshness | null
  refresh: () => Promise<void>
}

const DataFreshnessContext = createContext<DataFreshnessState | null>(null)

// Fetched once here (rather than per-page, the way InstitutionBanner mounts
// fresh on every route) so the admin's avatar badge and Dev Tools' own
// "last updated" lines always agree, and so navigating around doesn't spam
// GET /admin/data-freshness (feedback #69). Admin-only — never fetched for
// a regular member, both because the data doesn't matter to them and
// because the endpoint itself is admin-gated.
export function DataFreshnessProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  const [freshness, setFreshness] = useState<DataFreshness | null>(null)

  const refresh = useCallback(async () => {
    if (!isAdmin) return
    setFreshness(await fetchDataFreshness())
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin) {
      refresh().catch(() => {})
    } else {
      setFreshness(null)
    }
  }, [isAdmin, refresh])

  return <DataFreshnessContext.Provider value={{ freshness, refresh }}>{children}</DataFreshnessContext.Provider>
}

export function useDataFreshness(): DataFreshnessState {
  const context = useContext(DataFreshnessContext)
  if (!context) {
    throw new Error('useDataFreshness must be used within a DataFreshnessProvider')
  }
  return context
}
