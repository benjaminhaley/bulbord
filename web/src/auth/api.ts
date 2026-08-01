import { API_URL } from '../config'
import { readErrorMessage } from './http'
import { authHeaders, clearToken, getToken } from './token'

export interface CurrentUser {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  profileComplete: boolean
  roles: string[]
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const token = getToken()
  if (!token) return null

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: authHeaders(),
  })
  if (response.status === 401) {
    clearToken()
    return null
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch current user: ${response.status}`)
  }
  const body = (await response.json()) as { data: CurrentUser }
  return body.data
}

export async function updateProfile(updates: { name?: string; avatarUrl?: string }): Promise<CurrentUser> {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to update profile: ${response.status}`))
  }
  const body = (await response.json()) as { data: CurrentUser }
  return body.data
}

export interface InviteInfo {
  name: string
  avatarUrl: string | null
}

export async function fetchInviteInfo(inviterUserId: string): Promise<InviteInfo | null> {
  const response = await fetch(`${API_URL}/invites/${inviterUserId}`)
  if (!response.ok) return null
  const body = (await response.json()) as { data: InviteInfo }
  return body.data
}

export async function logout(): Promise<void> {
  const token = getToken()
  if (token) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {})
  }
  clearToken()
}
