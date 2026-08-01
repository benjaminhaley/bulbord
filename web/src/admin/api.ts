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
