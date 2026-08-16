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
  backlogged_at: string | null
  in_progress_at: string | null
  comment_count: number
  can_edit: boolean
}

export interface FeedbackComment {
  id: string
  feedback_id: string
  body: string
  created_at: string
  updated_at: string
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
  can_edit: boolean
  can_delete: boolean
}

interface FeedbackResponse {
  data: FeedbackItem[]
  has_more: boolean
  next_cursor: string | null
}

interface FeedbackItemResponse {
  data: FeedbackItem
}

interface FeedbackCommentsResponse {
  data: FeedbackComment[]
  has_more: boolean
  next_cursor: string | null
}

interface FeedbackCommentResponse {
  data: FeedbackComment
}

export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_URL}/feedback`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch feedback: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackResponse
  return body.data
}

export async function fetchFeedbackById(id: string): Promise<FeedbackItem> {
  const response = await fetch(`${API_URL}/feedback/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch feedback: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackItemResponse
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

// One click, no note prompt (feedback, 2026-08-16) — admin commentary now
// happens as an ordinary reply in the thread (feedback #98, see the comment
// functions below), not a dedicated note field/route.
export function completeFeedback(id: string): Promise<FeedbackItem> {
  return authedRequest('POST', `/feedback/${id}/complete`, {})
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

// Clears the unseen-reply badge (feedback #98) — called whenever the
// Feedback tab is opened.
export async function markFeedbackRepliesSeen(): Promise<void> {
  const response = await fetch(`${API_URL}/feedback/mark-replies-seen`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to mark feedback replies seen: ${response.status}`)
  }
}

export async function fetchFeedbackComments(id: string): Promise<FeedbackComment[]> {
  const response = await fetch(`${API_URL}/feedback/${id}/comments`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackCommentsResponse
  return body.data
}

export async function createFeedbackComment(id: string, body: string): Promise<FeedbackComment> {
  const response = await fetch(`${API_URL}/feedback/${id}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as FeedbackCommentResponse
  return responseBody.data
}

export async function updateFeedbackComment(id: string, commentId: string, body: string): Promise<FeedbackComment> {
  const response = await fetch(`${API_URL}/feedback/${id}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to update comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as FeedbackCommentResponse
  return responseBody.data
}

export async function deleteFeedbackComment(id: string, commentId: string): Promise<void> {
  const response = await fetch(`${API_URL}/feedback/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete comment: ${response.status}`)
  }
}
