import { API_URL } from '../config'
import { clearToken, getToken } from './token'

export interface CurrentUser {
  id: string
  name: string
  email: string | null
  roles: string[]
}

export function facebookLoginUrl(): string {
  return `${API_URL}/auth/facebook`
}

export async function exchangeLoginCode(code: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!response.ok) {
    throw new Error(`Failed to exchange login code: ${response.status}`)
  }
  const body = (await response.json()) as { data: { token: string } }
  return body.data.token
}

export async function passwordLogin(password: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/password-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message: string } } | null
    throw new Error(body?.error?.message ?? `Login failed: ${response.status}`)
  }
  const body = (await response.json()) as { data: { token: string } }
  return body.data.token
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const token = getToken()
  if (!token) return null

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
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

export async function logout(): Promise<void> {
  const token = getToken()
  if (token) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
  clearToken()
}
