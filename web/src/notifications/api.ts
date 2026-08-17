import { API_URL } from '../config'
import { readErrorMessage } from '../auth/http'
import { authHeaders } from '../auth/token'

export interface NotificationItem {
  id: string
  type: string
  message: string
  target_path: string
  actor_name: string | null
  actor_avatar_url: string | null
  created_at: string
  dismissed_at: string | null
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const response = await fetch(`${API_URL}/notifications`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to fetch notifications: ${response.status}`))
  }
  const body = (await response.json()) as { data: NotificationItem[] }
  return body.data
}

export async function dismissNotification(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/notifications/${id}/dismiss`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to dismiss notification: ${response.status}`))
  }
}

// Feedback #100: "in your settings, there should be notification settings,
// which indicate what notifications you'll be receiving by channel" — Email
// is the only toggleable channel (the in-app list is always on, it's the
// notification inbox itself). newsletter_email reuses the pre-existing
// newsletterSubscribed column under this same settings screen.
export interface NotificationSettings {
  newsletter_email: boolean
  friend_added_email: boolean
  feedback_reply_email: boolean
  content_comment_email: boolean
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const response = await fetch(`${API_URL}/notifications/settings`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to fetch notification settings: ${response.status}`))
  }
  const body = (await response.json()) as { data: NotificationSettings }
  return body.data
}

export async function updateNotificationSettings(patch: Partial<NotificationSettings>): Promise<void> {
  const response = await fetch(`${API_URL}/notifications/settings`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to update notification settings: ${response.status}`))
  }
}
