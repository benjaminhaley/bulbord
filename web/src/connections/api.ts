import { API_URL } from '../config'
import { readErrorMessage } from '../auth/http'
import { authHeaders } from '../auth/token'

export interface MemberSummary {
  id: string
  name: string
  avatarUrl: string | null
  // Never set by the real API today (the suggestions endpoint returns a
  // deduped, ordered list without saying which tier each row came from) —
  // only ChooseFriendsScreen.tsx's own DEMO_SUGGESTIONS populates this, to
  // make the sign-up flow preview's suggestion ordering ("the inviter, then
  // their connections, then a same-grade match, then everyone else")
  // visible on the demo screen itself rather than something you have to
  // take on faith. Optional so the real, reason-less rows render exactly as
  // before.
  reason?: string
}

// A pending request someone sent me — connectionId is what Accept/Decline
// act on (feedback #127).
export interface ReceivedRequest extends MemberSummary {
  connectionId: string
}

export interface ConnectionsState {
  friends: MemberSummary[]
  sentRequests: MemberSummary[]
  receivedRequests: ReceivedRequest[]
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Request failed: ${response.status}`))
  }
  const body = (await response.json()) as { data: T }
  return body.data
}

async function postJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders() })
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

// Sends a friend request (feedback #127) — if the target already sent you
// one, this accepts theirs instead of creating a second one; either way the
// caller doesn't need to know which happened, just that it resolved.
export async function requestConnection(userId: string): Promise<void> {
  const response = await fetch(`${API_URL}/connections`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to send friend request: ${response.status}`))
  }
}

export function acceptConnection(connectionId: string): Promise<void> {
  return postJson(`/connections/${connectionId}/accept`)
}

export function declineConnection(connectionId: string): Promise<void> {
  return postJson(`/connections/${connectionId}/decline`)
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
