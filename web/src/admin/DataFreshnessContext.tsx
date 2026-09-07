import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthContext'
import { fetchDataFreshness, type DataFreshness } from './api'
import { describeFreshnessAlert, freshnessAlertTargetPath, freshnessSignature } from './freshnessAlert'

// Feedback #140 (2026-09-07): "I still see a little red dot even though
// there's no notifications anymore" — InstitutionBanner's bell badge used
// to compute its own "is there a freshness alert" boolean straight off
// `freshness`, entirely independent of NotificationsPage's own dismiss
// logic for the same alert. Dismissing on one page had no way to tell the
// other, so the badge kept lighting up after the alert it was for had
// already been cleared. Both now read `isAlertActive`/`dismissAlert` from
// this one provider instead of each computing their own answer — the
// class of bug this caused (two independent computations of "the same"
// thing silently drifting apart) is exactly what a single shared source of
// truth is for.
const FRESHNESS_DISMISS_KEY = 'bulbord_freshness_alert_dismissed_signature'

interface DataFreshnessState {
  freshness: DataFreshness | null
  refresh: () => Promise<void>
  // Only non-null once genuinely active — i.e. there's a real is_stale/
  // running-low condition AND it hasn't already been dismissed for its
  // current signature. Read this instead of `freshness` directly to decide
  // whether to show anything; `freshness` itself stays here for pages (like
  // Dev Tools) that need the raw numbers regardless of dismissal.
  alertMessage: string | null
  alertTargetPath: string
  dismissAlert: () => void
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
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(() => {
    try {
      return localStorage.getItem(FRESHNESS_DISMISS_KEY)
    } catch {
      return null
    }
  })

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

  const signature = freshnessSignature(freshness)
  const rawAlertMessage = isAdmin ? describeFreshnessAlert(freshness) : null
  const alertMessage = rawAlertMessage && signature !== dismissedSignature ? rawAlertMessage : null
  const alertTargetPath = freshnessAlertTargetPath(freshness)

  const dismissAlert = useCallback(() => {
    if (!signature) return
    try {
      localStorage.setItem(FRESHNESS_DISMISS_KEY, signature)
    } catch {
      // best-effort — a private window or blocked storage just means this
      // alert re-shows next visit instead of staying dismissed, same as
      // any other per-browser preference in this app.
    }
    setDismissedSignature(signature)
  }, [signature])

  return (
    <DataFreshnessContext.Provider value={{ freshness, refresh, alertMessage, alertTargetPath, dismissAlert }}>
      {children}
    </DataFreshnessContext.Provider>
  )
}

export function useDataFreshness(): DataFreshnessState {
  const context = useContext(DataFreshnessContext)
  if (!context) {
    throw new Error('useDataFreshness must be used within a DataFreshnessProvider')
  }
  return context
}
