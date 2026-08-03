import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface AdminUser {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  invited_by_name: string | null
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
