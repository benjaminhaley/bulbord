import { API_URL } from '../config'
import { authHeaders } from '../auth/token'
import type { UploadedImage } from '../uploads/api'

export interface FeedbackItem {
  id: string
  number: number
  title: string
  description: string | null
  created_at: string
  author_name: string | null
  images: UploadedImage[]
  completed_at: string | null
  completion_note: string | null
  backlogged_at: string | null
  in_progress_at: string | null
  can_edit: boolean
}

interface FeedbackResponse {
  data: FeedbackItem[]
  has_more: boolean
  next_cursor: string | null
}

interface FeedbackItemResponse {
  data: FeedbackItem
}

export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_URL}/feedback`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch feedback: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackResponse
  return body.data
}

async function authedRequest(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<FeedbackItem> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Request to ${path} failed: ${response.status}`)
  }
  const responseBody = (await response.json()) as FeedbackItemResponse
  return responseBody.data
}

export function createFeedback(title: string, description: string, images: UploadedImage[]): Promise<FeedbackItem> {
  return authedRequest('POST', '/feedback', { title, description, images })
}

export function updateFeedback(
  id: string,
  title: string,
  description: string,
  images: UploadedImage[],
): Promise<FeedbackItem> {
  return authedRequest('PATCH', `/feedback/${id}`, { title, description, images })
}

// One click, no note prompt (feedback, 2026-08-16) — a note is now its own
// independent action, setFeedbackNote below.
export function completeFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/complete`, {})
}

// Sets/edits/clears the admin annotation note on its own, whether or not the
// item is completed — moved out from under "Mark done" per the same
// feedback (an empty string clears the note).
export function setFeedbackNote(id: string, note: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/note`, { note })
}

export function backlogFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/backlog`, {})
}

export function unbacklogFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/unbacklog`, {})
}

export function startProgressFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/start-progress`, {})
}

export function stopProgressFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/stop-progress`, {})
}

export async function deleteFeedback(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/feedback/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete feedback: ${response.status}`)
  }
}
