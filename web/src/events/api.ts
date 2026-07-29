export interface Event {
  id: string
  title: string
  description: string | null
  start_date: string
  start_time: string | null
  all_day: boolean
  address: string | null
  source_url: string | null
}

interface EventsResponse {
  data: Event[]
  has_more: boolean
  next_cursor: string | null
}

const API_URL = import.meta.env.VITE_API_URL as string

export async function fetchEvents(): Promise<Event[]> {
  const response = await fetch(`${API_URL}/events`)
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`)
  }
  const body = (await response.json()) as EventsResponse
  return body.data
}
