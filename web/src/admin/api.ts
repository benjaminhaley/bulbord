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

// Dev tool (feedback #120) — renders and sends the "day off camp" reminder
// email for the soonest upcoming school break that actually has camps
// listed, to the admin's own address, ignoring the real 28-days-before
// trigger so it can be checked live anytime.
export async function sendTestCampReminderEmail(): Promise<void> {
  const response = await fetch(`${API_URL}/admin/camp-reminders/test-send`, {
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

// Dev tool (feedback, 2026-08-16; reworked into a real request/accept model
// by feedback #127): creates a real throwaway member that actually sends
// the admin a friend request, repeatable on demand — unlike the email
// preview above, this exercises the whole real path (email, in-app
// notification, and the real Accept/Decline buttons), not just the template.
export async function createTestFriendRequest(): Promise<{ id: string; name: string }> {
  const response = await fetch(`${API_URL}/admin/connections/test-request`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to create test friend request: ${response.status}`)
  }
  const body = (await response.json()) as { data: { id: string; name: string } }
  return body.data
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

interface ResourceReport {
  sources_checked: number
  total_added: number
  total_skipped: number
  last_checked_at: string | null
  results: { source_id: string; name: string; added: number; skipped: number; error?: string }[]
}

// Dev tool (feedback #41) — re-runs the ingestion pipeline against every
// known active source on demand, instead of waiting for a manual sourcing
// pass or the weekly cron (feedback #131, see fetchEventSourcingStatus below).
export async function resourceEventSources(): Promise<LastEventSourcingRun> {
  const response = await fetch(`${API_URL}/admin/events/resource`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Failed to re-run sourcing: ${response.status}`)
  }
  const body = (await response.json()) as { data: LastEventSourcingRun }
  return body.data
}

// Dev tool (feedback #115) — runs the same extraction/ingestion pass a real
// inbound email webhook triggers, against pasted-in text. Works today even
// before the real Resend receiving-domain/webhook setup is finished (see
// CLAUDE.md's Events data model & sourcing section).
export async function testEmailIngest(params: { fromAddress: string; subject: string; body: string }): Promise<{ added: number; skipped: number }> {
  const response = await fetch(`${API_URL}/admin/events/test-email-ingest`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_address: params.fromAddress, subject: params.subject, body: params.body }),
  })
  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(errBody?.error?.message ?? `Failed to test email ingest: ${response.status}`)
  }
  const body = (await response.json()) as { data: { added: number; skipped: number } }
  return body.data
}

// Feedback #131 ("keep some summary in admin of what has changed"): the
// weekly auto-sourcing cron and the manual "Re-run event sourcing" button
// both go through resourceActiveEventSources() and write the same one
// `event_sourcing_run` events_log summary — this reads that back so Dev
// Tools shows the most recent run (whichever kind) on page load, not just
// right after a manual click.
export interface LastEventSourcingRun extends ResourceReport {
  actor: string
  ran_at: string
}

export interface EventSourcingStatus {
  lastCheckedAt: string | null
  lastRun: LastEventSourcingRun | null
}

// Shown before the admin has clicked anything, so "0 added" after a run
// doesn't read as broken when it just hasn't been run recently.
export async function fetchEventSourcingStatus(): Promise<EventSourcingStatus> {
  const response = await fetch(`${API_URL}/admin/events/resource`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch event-sourcing status: ${response.status}`)
  }
  const body = (await response.json()) as { data: { last_checked_at: string | null; last_run: LastEventSourcingRun | null } }
  return { lastCheckedAt: body.data.last_checked_at, lastRun: body.data.last_run }
}

export interface BrokenImage {
  event_id: string
  title: string
  image_url: string
}

// Dev tool (2026-09-05, after a broken-image icon reached production
// undetected — see api/src/events/image-health.ts's own header for the
// full incident): checks whether every live event's stored image is
// actually servable right now, from the same vantage point real member
// traffic uses — cheap enough to run on every Dev Tools page load, not
// just an explicit click, the same "don't make someone remember to press a
// button" posture as the data-freshness badge.
export async function fetchImageHealth(): Promise<{ checkedAt: string; broken: BrokenImage[] }> {
  const response = await fetch(`${API_URL}/admin/events/image-health`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to check image health: ${response.status}`)
  }
  const body = (await response.json()) as { data: { checked_at: string; broken: BrokenImage[] } }
  return { checkedAt: body.data.checked_at, broken: body.data.broken }
}

// Feedback #119 — a recurring listing (e.g. the Nettelhorst French Market)
// with an established real cadence whose last known occurrence is closer
// than its own typical gap between occurrences: "you're about due for
// another one of these, and there isn't one." A different signal than the
// two timestamps above (which only measure "have we looked recently"), but
// surfaced through the same admin nudge — see api/src/events/recurring-series-health.ts.
interface LowRecurringSeries {
  title: string
  source_id: string | null
  source_name: string | null
  occurrence_count: number
  last_occurrence_date: string
  typical_gap_days: number
  days_until_last_occurrence: number
}

// Feedback #69 — how stale events/camps data is, so the admin's own avatar
// and Dev Tools can flag it without a manual check.
export interface DataFreshness {
  events_last_checked_at: string | null
  camps_last_updated_at: string | null
  oldest_at: string | null
  is_stale: boolean
  recurring_series_running_low: LowRecurringSeries[]
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

// Feedback #101: narrows (or hides) the recent-activity log to one person.
export interface AnalyticsActorFilter {
  actorId: string
  mode: 'include' | 'exclude'
}

export async function fetchAnalyticsSummary(filter?: AnalyticsActorFilter): Promise<AnalyticsSummary> {
  const params = filter ? `?actor_id=${encodeURIComponent(filter.actorId)}&actor_mode=${filter.mode}` : ''
  const response = await fetch(`${API_URL}/admin/analytics/summary${params}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.status}`)
  }
  const body = (await response.json()) as { data: AnalyticsSummary }
  return body.data
}
