import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface AdminUser {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  invited_by_name: string | null
  newsletter_subscribed: boolean
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const response = await fetch(`${API_URL}/admin/users`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.status}`)
  }
  const body = (await response.json()) as { data: AdminUser[] }
  return body.data
}

// Dev tool (feedback #38) — renders and sends this week's real newsletter to
// the admin's own address, so a styling/copy change can be checked live
// without waiting for the Sunday cron send.
export async function sendTestNewsletterEmail(): Promise<void> {
  const response = await fetch(`${API_URL}/admin/newsletter/test-send`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to send test email: ${response.status}`)
  }
}

export interface ResourceReport {
  sources_checked: number
  total_added: number
  total_skipped: number
  last_checked_at: string | null
  results: { source_id: string; name: string; added: number; skipped: number; error?: string }[]
}

// Dev tool (feedback #41) — re-runs the ingestion pipeline against every
// known active source on demand, instead of waiting for a manual sourcing
// pass or a future daily job.
export async function resourceEventSources(): Promise<ResourceReport> {
  const response = await fetch(`${API_URL}/admin/events/resource`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to re-run sourcing: ${response.status}`)
  }
  const body = (await response.json()) as { data: ResourceReport }
  return body.data
}

// Shown before the admin has clicked anything, so "0 added" after a run
// doesn't read as broken when it just hasn't been run recently.
export async function fetchSourcesLastCheckedAt(): Promise<string | null> {
  const response = await fetch(`${API_URL}/admin/events/resource`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch sources last-checked time: ${response.status}`)
  }
  const body = (await response.json()) as { data: { last_checked_at: string | null } }
  return body.data.last_checked_at
}
