import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export interface Event {
  id: string
  title: string
  description: string | null
  start_date: string
  start_time: string | null
  all_day: boolean
  address: string | null
  location_name: string | null
  source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
  starred: boolean
}

export interface EventSource {
  id: string
  name: string
  url: string
  type: string
}

interface EventsResponse {
  data: Event[]
  has_more: boolean
  next_cursor: string | null
}

interface EventResponse {
  data: Event
}

interface EventSourcesResponse {
  data: EventSource[]
}

export async function fetchEvents(): Promise<Event[]> {
  const response = await fetch(`${API_URL}/events`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`)
  }
  const body = (await response.json()) as EventsResponse
  return body.data
}

export async function fetchEvent(id: string): Promise<Event> {
  const response = await fetch(`${API_URL}/events/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch event: ${response.status}`)
  }
  const body = (await response.json()) as EventResponse
  return body.data
}

export async function starEvent(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}/star`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to star event: ${response.status}`)
  }
}

export async function unstarEvent(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}/star`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to unstar event: ${response.status}`)
  }
}

export async function fetchEventSources(): Promise<EventSource[]> {
  const response = await fetch(`${API_URL}/event-sources`)
  if (!response.ok) {
    throw new Error(`Failed to fetch event sources: ${response.status}`)
  }
  const body = (await response.json()) as EventSourcesResponse
  return body.data
}
