import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type InterestStatus = 'interested' | 'dismissed'

export interface Event {
  id: string
  title: string
  description: string | null
  start_date: string
  start_time: string | null
  end_time: string | null
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
  // Present only for member self-service posts (feedback #46); null for
  // system-sourced events, which have no submitter. Used to attribute the
  // post and as a placeholder image fallback when the event has no photo
  // of its own (feedback, 2026-08-03).
  submitted_by: { name: string; avatar_url: string | null } | null
  // Optional subject category (feedback #97) — see topics.ts's fixed list.
  // Null for an unclassified/older event, not defaulted to "Other".
  topic: string | null
}

// Fields a member supplies when submitting or editing their own event
// (feedback #46). Only title, address ("location"), and start_date are
// required — enforced both here (disabled submit button) and server-side.
export interface EventInput {
  title: string
  description: string
  start_date: string
  start_time: string
  end_time: string
  all_day: boolean
  location_name: string
  address: string
  source_url: string
  image_url: string | null
  thumbnail_url: string | null
  topic: string
  // Only ever set by the photo-extraction flow (AddEventChoice.tsx) — its
  // presence tells POST /events to also register source_url as a crawlable
  // event_sources row (feedback, 2026-08-23). Never shown/edited in the UI.
  source_name?: string
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

interface EventSourceResponse {
  data: EventSource
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

// Feedback #97's topic + hours-of-day-range filters — shared query-param
// shape between the paginated list (fetchEvents below) and the calendar
// week view (fetchEventsForWeek).
export interface EventFilters {
  topics?: string[]
  afterTime?: string // 'HH:MM'
  beforeTime?: string // 'HH:MM'
}

function applyFilterParams(url: URL, filters?: EventFilters) {
  if (filters?.topics?.length) url.searchParams.set('topics', filters.topics.join(','))
  if (filters?.afterTime) url.searchParams.set('after_time', filters.afterTime)
  if (filters?.beforeTime) url.searchParams.set('before_time', filters.beforeTime)
}

// GET /events paginates (100/page max) — loop through every page rather than
// silently showing only the chronologically-soonest page. Fine at this app's
// scale (low hundreds of events at most); a true infinite-scroll UI would be
// overkill for a family app's event list.
export async function fetchEvents(options?: { includeHidden?: boolean } & EventFilters): Promise<FetchEventsResult> {
  const all: Event[] = []
  let cursor: string | null = null
  let hiddenCount = 0
  let firstPage = true

  for (;;) {
    const url = new URL(`${API_URL}/events`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    if (options?.includeHidden) url.searchParams.set('include_hidden', 'true')
    applyFilterParams(url, options)

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

interface EventsWeekResponse {
  data: Event[]
}

// Calendar week view (feedback #97) — every real occurrence in a
// Sunday-Saturday week (weekStart = that Sunday, 'YYYY-MM-DD'), not the
// next-occurrence-collapsed set fetchEvents returns.
export async function fetchEventsForWeek(weekStart: string, filters?: EventFilters): Promise<Event[]> {
  const url = new URL(`${API_URL}/events/week`)
  url.searchParams.set('start', weekStart)
  applyFilterParams(url, filters)

  const response = await fetch(url, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch week events: ${response.status}`)
  }
  const body = (await response.json()) as EventsWeekResponse
  return body.data
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

// Mirrors api/src/events/photo-extraction.ts's ExtractedEventFields — a
// candidate, not a created Event, so AddEventModal.tsx can hand it straight
// into EventForm's `initial` prop for review before anything is ever posted
// (feedback #93). Stage 1 only (vision, fast) — no source_name, since that
// only ever comes from stage 2's live search (findEventSource, below).
export interface ExtractedEventFields {
  title: string
  description?: string
  start_date: string
  start_time?: string
  end_time?: string
  all_day: boolean
  address?: string
  location_name?: string
  source_url?: string
  topic?: string
}

interface ExtractFromPhotoResponse {
  data: ExtractedEventFields | null
}

// Stage 1 of 2 (feedback, 2026-08-23) — vision only, fast. AddEventModal.tsx
// calls this first and shows the review form the instant it resolves.
export async function extractEventFieldsFromPhoto(imageUrl: string): Promise<ExtractedEventFields | null> {
  const response = await fetch(`${API_URL}/events/extract-from-photo`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl }),
  })
  if (!response.ok) {
    throw new Error(`Failed to extract event from photo: ${response.status}`)
  }
  const body = (await response.json()) as ExtractFromPhotoResponse
  return body.data
}

export interface DiscoveredEventSource {
  source_url: string
  source_name: string
  // A real, confirmed street address for the venue, only when the search
  // found one it's genuinely confident in (feedback, 2026-08-23: "the
  // address is a specific thing that Google Maps would always get right")
  // — many posters name a well-known venue with no printed street address
  // at all, so this is a second thing worth finding in the same search
  // that already looks up the hosting organization's own page.
  address?: string
}

interface FindEventSourceResponse {
  data: DiscoveredEventSource | null
}

// Stage 2 of 2 — a slower live web search for the event's real hosting
// organization, called only when stage 1 didn't already find a URL printed
// on the poster. AddEventModal.tsx runs this in the background, in
// parallel with the member already reviewing/editing stage 1's result, and
// applies whatever it finds (or doesn't) without blocking anything.
export async function findEventSource(fields: {
  title: string
  location_name?: string
  address?: string
}): Promise<DiscoveredEventSource | null> {
  const response = await fetch(`${API_URL}/events/find-event-source`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!response.ok) {
    throw new Error(`Failed to find event source: ${response.status}`)
  }
  const body = (await response.json()) as FindEventSourceResponse
  return body.data
}

interface ExtractFromDescriptionResponse {
  data: ExtractedEventFields | null
}

// Description-to-listing extraction (feedback #133), stage 1 of 2 — the
// same shape as extractEventFieldsFromPhoto above, this time starting from
// a member-typed sentence instead of a photo. Fast, no web search: reads
// whatever the description already states outright. Unlike the photo
// flow, a missing start_date doesn't mean "couldn't extract anything" —
// see toStage1Fields's own comment in api/src/events/description-
// extraction.ts — so `start_date` can legitimately come back empty even
// when `data` itself isn't null.
export async function extractEventFieldsFromDescription(description: string): Promise<ExtractedEventFields | null> {
  const response = await fetch(`${API_URL}/events/extract-from-description`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  if (!response.ok) {
    throw new Error(`Failed to extract event from description: ${response.status}`)
  }
  const body = (await response.json()) as ExtractFromDescriptionResponse
  return body.data
}

// A superset of DiscoveredEventSource above — the description flow's stage
// 2 search is responsible for finding the whole event (date/time/address
// included), not just its source, since a typed description frequently
// can't supply those on its own the way a photographed poster almost
// always can. Every field is optional; AddEventModal.tsx only ever
// applies one to a form field that's still empty. No `all_day` here — see
// api/src/events/description-extraction.ts's identical interface for why:
// it's derived from start_time's presence, not asked of the model, so
// there's nothing for this shape to carry.
export interface DiscoveredEventDetails {
  source_url?: string
  source_name?: string
  title?: string
  description?: string
  start_date?: string
  start_time?: string
  end_time?: string
  address?: string
  location_name?: string
  topic?: string
}

interface FindEventDetailsResponse {
  data: DiscoveredEventDetails | null
}

// Description-to-listing extraction, stage 2 of 2 — always worth calling
// for this flow (unlike findEventSource above, which the photo flow only
// calls conditionally), since even a fully-successful stage 1 still
// benefits from a confirmed real source page, and a stage-1 failure means
// this is the only remaining path to a usable result. Takes the raw
// description text (not just stage 1's structured fields) plus whatever
// stage 1 already found, so the search has real context to work from.
export async function findEventDetailsFromDescription(
  description: string,
  alreadyKnown: Partial<ExtractedEventFields>,
): Promise<DiscoveredEventDetails | null> {
  const response = await fetch(`${API_URL}/events/find-event-details-from-description`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, fields: alreadyKnown }),
  })
  if (!response.ok) {
    throw new Error(`Failed to find event details: ${response.status}`)
  }
  const body = (await response.json()) as FindEventDetailsResponse
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

// Admin-only (feedback, 2026-08-17, "consolidate these icons" — moved here
// from a member-facing icon on the Events toolbar into Developer Tools).
export interface EventSourceInput {
  name: string
  url: string
  type: string
  notes: string
}

export async function createEventSource(input: EventSourceInput): Promise<EventSource> {
  const response = await fetch(`${API_URL}/event-sources`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Failed to create event source: ${response.status}`)
  }
  const body = (await response.json()) as EventSourceResponse
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
