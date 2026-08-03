import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type InterestStatus = 'interested' | 'dismissed'

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
  interest_status: InterestStatus | null
  interested_count: number
  // In interest order, with the viewer's own name already replaced with "You"
  // (feedback #43 — icon-stack teaser needs a photo/initials per person, not
  // just names).
  interested_people: { name: string; avatar_url: string | null }[]
  // True only for the member who submitted this event (feedback #46) — never
  // true for system-sourced events, which have no submitter to match.
  can_edit: boolean
}

// Fields a member supplies when submitting or editing their own event
// (feedback #46). Only title, address ("location"), and start_date are
// required — enforced both here (disabled submit button) and server-side.
export interface EventInput {
  title: string
  description: string
  start_date: string
  start_time: string
  all_day: boolean
  address: string
  source_url: string
  image_url: string | null
  thumbnail_url: string | null
}

export interface InterestedUser {
  id: string
  name: string
  avatar_url: string | null
}

export interface EventComment {
  id: string
  event_id: string
  body: string
  created_at: string
  updated_at: string
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
  can_edit: boolean
  can_delete: boolean
}

export interface EventSource {
  id: string
  name: string
  url: string
  type: string
  // Events from this source that are actually approved + upcoming right now
  // — not an all-time count of everything ever ingested from it.
  event_count: number
}

interface SourceEvent {
  id: string
  title: string
  start_date: string
  status: string
}

export interface EventSourceDetail extends EventSource {
  notes: string | null
  is_active: boolean
  last_checked_at: string | null
  last_event_added_at: string | null
  is_stale: boolean
  // Every event ever ingested from this source, regardless of status/date —
  // event_count (inherited above) is the approved+upcoming subset of these.
  events: SourceEvent[]
}

interface EventsResponse {
  data: Event[]
  has_more: boolean
  next_cursor: string | null
  // Occurrences suppressed by the next-occurrence collapse across the whole
  // upcoming window (feedback #48), not just this page — 0 whenever
  // include_hidden was requested, since nothing is left hidden in that case.
  hidden_count: number
}

interface EventResponse {
  data: Event
}

interface EventSourcesResponse {
  data: EventSource[]
}

interface EventCommentsResponse {
  data: EventComment[]
  has_more: boolean
  next_cursor: string | null
}

interface EventCommentResponse {
  data: EventComment
}

interface InterestedUsersResponse {
  data: InterestedUser[]
}

interface EventSourceDetailResponse {
  data: EventSourceDetail
}

export interface FetchEventsResult {
  events: Event[]
  // hidden_count is the same total on every page, so only the first page's
  // value is kept (feedback #48).
  hiddenCount: number
}

// GET /events paginates (100/page max) — loop through every page rather than
// silently showing only the chronologically-soonest page. Fine at this app's
// scale (low hundreds of events at most); a true infinite-scroll UI would be
// overkill for a family app's event list.
export async function fetchEvents(options?: { includeHidden?: boolean }): Promise<FetchEventsResult> {
  const all: Event[] = []
  let cursor: string | null = null
  let hiddenCount = 0
  let firstPage = true

  for (;;) {
    const url = new URL(`${API_URL}/events`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    if (options?.includeHidden) url.searchParams.set('include_hidden', 'true')

    const response = await fetch(url, { headers: authHeaders() })
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.status}`)
    }
    const body = (await response.json()) as EventsResponse
    all.push(...body.data)
    if (firstPage) {
      hiddenCount = body.hidden_count
      firstPage = false
    }

    if (!body.has_more || !body.next_cursor) break
    cursor = body.next_cursor
  }

  return { events: all, hiddenCount }
}

export async function createEvent(input: EventInput): Promise<Event> {
  const response = await fetch(`${API_URL}/events`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to create event: ${response.status}`)
  }
  const body = (await response.json()) as EventResponse
  return body.data
}

export async function updateEvent(id: string, input: EventInput): Promise<Event> {
  const response = await fetch(`${API_URL}/events/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to update event: ${response.status}`)
  }
  const body = (await response.json()) as EventResponse
  return body.data
}

export async function deleteEvent(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete event: ${response.status}`)
  }
}

export async function fetchEvent(id: string): Promise<Event> {
  const response = await fetch(`${API_URL}/events/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch event: ${response.status}`)
  }
  const body = (await response.json()) as EventResponse
  return body.data
}

export async function setEventInterest(id: string, status: InterestStatus): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}/interest`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set event interest: ${response.status}`)
  }
}

export async function clearEventInterest(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}/interest`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to clear event interest: ${response.status}`)
  }
}

export async function fetchEventSource(id: string): Promise<EventSourceDetail> {
  const response = await fetch(`${API_URL}/event-sources/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch event source: ${response.status}`)
  }
  const body = (await response.json()) as EventSourceDetailResponse
  return body.data
}

export async function fetchInterestedUsers(id: string): Promise<InterestedUser[]> {
  const response = await fetch(`${API_URL}/events/${id}/interested`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch interested users: ${response.status}`)
  }
  const body = (await response.json()) as InterestedUsersResponse
  return body.data
}

export async function fetchEventSources(): Promise<EventSource[]> {
  const response = await fetch(`${API_URL}/event-sources`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch event sources: ${response.status}`)
  }
  const body = (await response.json()) as EventSourcesResponse
  return body.data
}

export async function fetchEventComments(id: string): Promise<EventComment[]> {
  const response = await fetch(`${API_URL}/events/${id}/comments`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`)
  }
  const body = (await response.json()) as EventCommentsResponse
  return body.data
}

export async function createEventComment(id: string, body: string): Promise<EventComment> {
  const response = await fetch(`${API_URL}/events/${id}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as EventCommentResponse
  return responseBody.data
}

export async function updateEventComment(id: string, commentId: string, body: string): Promise<EventComment> {
  const response = await fetch(`${API_URL}/events/${id}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to update comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as EventCommentResponse
  return responseBody.data
}

export async function deleteEventComment(id: string, commentId: string): Promise<void> {
  const response = await fetch(`${API_URL}/events/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete comment: ${response.status}`)
  }
}
