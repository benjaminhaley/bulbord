import { API_URL } from '../config'
import { getToken } from '../auth/token'

export interface FeedbackItem {
  id: string
  title: string
  description: string | null
  created_at: string
  author_name: string | null
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

export async function createFeedback(title: string, description: string): Promise<FeedbackItem> {
  const token = getToken()
  const response = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title, description }),
  })
  if (!response.ok) {
    throw new Error(`Failed to post feedback: ${response.status}`)
  }
  const body = (await response.json()) as FeedbackItemResponse
  return body.data
}
