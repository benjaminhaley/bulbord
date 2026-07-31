import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface FeedbackItem {
  id: string
  title: string
  description: string | null
  created_at: string
  author_name: string | null
  image_url: string | null
  thumbnail_url: string | null
  completed_at: string | null
  completion_note: string | null
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
  const response = await fetch(`${API_URL}/feedback`)
  if (!response.ok) {
    throw new Error(`Failed to fetch feedback: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackResponse
  return body.data
}

async function authedPost(path: string, body: unknown): Promise<FeedbackItem> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
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

export function createFeedback(
  title: string,
  description: string,
  image?: { image_url: string; thumbnail_url: string },
): Promise<FeedbackItem> {
  return authedPost('/feedback', {
    title,
    description,
    image_url: image?.image_url,
    thumbnail_url: image?.thumbnail_url,
  })
}

export function completeFeedback(id: string, note: string): Promise<FeedbackItem> {
  return authedPost(`/feedback/${id}/complete`, { note })
}
