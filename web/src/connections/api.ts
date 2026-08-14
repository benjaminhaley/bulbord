import { API_URL } from '../config'
import { readErrorMessage } from '../auth/http'
import { authHeaders } from '../auth/token'

export interface MemberSummary {
  id: string
  name: string
  avatarUrl: string | null
}

export interface ConnectionsState {
  friends: MemberSummary[]
  following: MemberSummary[]
  followers: MemberSummary[]
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Request failed: ${response.status}`))
  }
  const body = (await response.json()) as { data: T }
  return body.data
}

export function fetchConnectionsState(): Promise<ConnectionsState> {
  return getJson('/connections')
}

export function fetchSuggestions(): Promise<MemberSummary[]> {
  return getJson('/connections/suggestions')
}

export function fetchConnectionsOf(userId: string): Promise<MemberSummary[]> {
  return getJson(`/connections/of/${userId}`)
}

export function searchMembers(query: string): Promise<MemberSummary[]> {
  return getJson(`/connections/members?q=${encodeURIComponent(query)}`)
}

export async function addConnection(userId: string): Promise<void> {
  const response = await fetch(`${API_URL}/connections`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to add connection: ${response.status}`))
  }
}

export async function finishFriendsOnboarding(): Promise<void> {
  const response = await fetch(`${API_URL}/connections/finish-onboarding`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to finish onboarding: ${response.status}`))
  }
}
