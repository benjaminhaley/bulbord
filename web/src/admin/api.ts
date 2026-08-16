import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface AdminUser {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  invited_by_name: string | null
  newsletter_subscribed: boolean
  role: 'staff' | 'family' | 'other' | null
  role_other: string | null
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

// Dev tool: renders and sends a real "X added you as a friend" alert email
// (connections/template.ts) to the admin's own address, using their own
// name/photo as the "adder" — same "no second account needed" shape as the
// newsletter test-send above.
export async function sendTestConnectionAlertEmail(): Promise<void> {
  const response = await fetch(`${API_URL}/admin/connections/test-send`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to send test email: ${response.status}`)
  }
}

// Feedback #87: a short-lived (~1hr) sign-in link for any member, so an
// admin can see the app as they'd see it (testing, demos) without needing
// their device.
export interface ImpersonationLink {
  url: string
  expires_at: string
}

export async function impersonateUser(userId: string): Promise<ImpersonationLink> {
  const response = await fetch(`${API_URL}/admin/users/${userId}/impersonate`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to create sign-in link: ${response.status}`)
  }
  const body = (await response.json()) as { data: ImpersonationLink }
  return body.data
}

// Feedback #92: lets an admin remove a member, for testing (cleaning up
// throwaway accounts) and moderation. Soft-delete on the server — see
// api/src/admin/memberDeletion.ts.
export async function deleteMember(userId: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to delete member: ${response.status}`)
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

// Feedback #69 — how stale events/camps data is, so the admin's own avatar
// and Dev Tools can flag it without a manual check.
export interface DataFreshness {
  events_last_checked_at: string | null
  camps_last_updated_at: string | null
  oldest_at: string | null
  is_stale: boolean
}

export async function fetchDataFreshness(): Promise<DataFreshness> {
  const response = await fetch(`${API_URL}/admin/data-freshness`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch data freshness: ${response.status}`)
  }
  const body = (await response.json()) as { data: DataFreshness }
  return body.data
}

// Feedback #96 — see api/src/analytics/service.ts for what's tracked/why.
export interface AnalyticsSummary {
  active_today: number
  active_this_week: number
  event_viewers_7d: number
  camp_viewers_7d: number
  sharers_7d: number
  dau: { date: string; count: number }[]
  last_active_by_member: { user_id: string; name: string; avatar_url: string | null; last_active_at: string }[]
  recent_log: { id: string; actor: string; actor_name: string; action: string; metadata: unknown; created_at: string }[]
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const response = await fetch(`${API_URL}/admin/analytics/summary`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.status}`)
  }
  const body = (await response.json()) as { data: AnalyticsSummary }
  return body.data
}
