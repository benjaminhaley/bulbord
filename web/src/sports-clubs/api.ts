import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type InterestStatus = 'interested' | 'dismissed'
export type ScheduleType = 'fixed_session' | 'ongoing'

// One individual date this listing actually meets on — new to this tab, no
// events/camps equivalent (see api/src/db/schema.ts's sportsClubOccurrences
// for the full rationale: a series' ages/cost/signup-status can't safely be
// duplicated across N rows the way events' flat recurring listings can).
export interface SportsClubOccurrence {
  date: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

// A real, distinct bookable tier — different age levels each meeting at a
// different time, a half-day/full-day split, etc. Only present for a
// listing that genuinely has more than one (see api/src/db/schema.ts's
// SportsClubOptionLine) — most listings have none and rely on
// cadence_note/price/price_unit instead.
export interface SportsClubOptionLine {
  label: string
  start_time: string | null
  end_time: string | null
  price: string | null
  price_unit: string | null
  age_min: number | null
  age_max: number | null
  note: string | null
}

export interface SportsClub {
  id: string
  title: string
  description: string | null
  category: string | null
  schedule_type: ScheduleType
  first_date: string | null
  last_date: string | null
  cadence_note: string | null
  age_min: number | null
  age_max: number | null
  price: string | null
  price_unit: string | null
  price_per_week: string | null
  price_note: string | null
  options: SportsClubOptionLine[] | null
  address: string | null
  location_name: string | null
  distance_miles: string | null
  signup_status: string | null
  signup_instructions: string | null
  source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
  interest_status: InterestStatus | null
  interested_count: number
  interested_people: { name: string; avatar_url: string | null }[]
  can_edit: boolean
  submitted_by: { name: string; avatar_url: string | null } | null
  source: { id: string; name: string } | null
  next_occurrence_date: string | null
  // A short preview on the flat-list fetch (see api/src/sports-clubs/
  // routes.ts's LIST_OCCURRENCE_PREVIEW_LIMIT); the full known schedule on
  // the detail fetch.
  occurrences: SportsClubOccurrence[]
}

// Only present on the GET /sports-clubs list response (see sorting.ts) —
// true for a fixed_session listing whose firstDate has already passed but
// that's still relevant, drives the "Show N already-started" reveal row.
export interface SportsClubListItem extends SportsClub {
  hidden_by_default: boolean
}

// Fields a member supplies when submitting or editing their own listing.
// Only title, category, and address are required — deliberately simpler
// than the full SportsClub shape (same "keep it simple" posture as Camps'
// member self-service): no occurrence editor, since a member-submitted
// listing never gets sports_club_occurrences rows.
export interface SportsClubInput {
  title: string
  description: string
  category: string
  schedule_type: ScheduleType
  first_date: string
  last_date: string
  cadence_note: string
  age_min: number | null
  age_max: number | null
  price: number | null
  price_unit: string
  price_note: string
  address: string
  signup_instructions: string
  source_url: string
  image_url: string | null
  thumbnail_url: string | null
}

export interface InterestedUser {
  id: string
  name: string
  avatar_url: string | null
}

export interface SportsClubComment {
  id: string
  sports_club_id: string
  body: string
  created_at: string
  updated_at: string
  author_id: string
  author_name: string | null
  author_avatar_url: string | null
  can_edit: boolean
  can_delete: boolean
}

export interface SourceNote {
  id: string
  body: string
  created_at: string
  author_name: string | null
  author_avatar_url: string | null
  sports_club_id: string
  sports_club_title: string
}

export interface SportsClubSource {
  id: string
  name: string
  url: string
  type: string
  sports_club_count: number
}

interface SourceSportsClub {
  id: string
  title: string
  schedule_type: ScheduleType
  first_date: string | null
  last_date: string | null
  status: string
}

export interface SportsClubSourceDetail extends SportsClubSource {
  notes: string | null
  is_active: boolean
  last_checked_at: string | null
  last_sports_club_added_at: string | null
  is_stale: boolean
  sports_clubs: SourceSportsClub[]
}

interface SportsClubsResponse {
  data: SportsClubListItem[]
  hidden_started_count: number
}

interface SportsClubResponse {
  data: SportsClub
}

interface SportsClubSourcesResponse {
  data: SportsClubSource[]
}

interface SportsClubSourceDetailResponse {
  data: SportsClubSourceDetail
}

interface SportsClubSourceResponse {
  data: SportsClubSource
}

interface SportsClubCommentsResponse {
  data: SportsClubComment[]
}

interface SportsClubCommentResponse {
  data: SportsClubComment
}

interface InterestedUsersResponse {
  data: InterestedUser[]
}

interface SourceNotesResponse {
  data: SourceNote[]
}

export async function fetchSportsClubs(includeStarted = false): Promise<{ data: SportsClubListItem[]; hiddenStartedCount: number }> {
  const response = await fetch(`${API_URL}/sports-clubs${includeStarted ? '?include_started=true' : ''}`, {
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch sports clubs: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubsResponse
  return { data: body.data, hiddenStartedCount: body.hidden_started_count }
}

export async function fetchSportsClub(id: string): Promise<SportsClub> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch sports club: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubResponse
  return body.data
}

export async function createSportsClub(input: SportsClubInput): Promise<SportsClub> {
  const response = await fetch(`${API_URL}/sports-clubs`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to create sports club: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubResponse
  return body.data
}

export async function updateSportsClub(id: string, input: SportsClubInput): Promise<SportsClub> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to update sports club: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubResponse
  return body.data
}

export async function deleteSportsClub(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to delete sports club: ${response.status}`)
  }
}

export async function setSportsClubInterest(id: string, status: InterestStatus): Promise<void> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/interest`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set interest: ${response.status}`)
  }
}

export async function clearSportsClubInterest(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/interest`, { method: 'DELETE', headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to clear interest: ${response.status}`)
  }
}

export async function fetchInterestedSportsClubUsers(id: string): Promise<InterestedUser[]> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/interested`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch interested users: ${response.status}`)
  }
  const body = (await response.json()) as InterestedUsersResponse
  return body.data
}

export async function fetchSportsClubSourceNotes(id: string): Promise<SourceNote[]> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/source-notes`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch source notes: ${response.status}`)
  }
  const body = (await response.json()) as SourceNotesResponse
  return body.data
}

export async function fetchSportsClubSources(): Promise<SportsClubSource[]> {
  const response = await fetch(`${API_URL}/sports-club-sources`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch sports club sources: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubSourcesResponse
  return body.data
}

export async function fetchSportsClubSource(id: string): Promise<SportsClubSourceDetail> {
  const response = await fetch(`${API_URL}/sports-club-sources/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch sports club source: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubSourceDetailResponse
  return body.data
}

// Admin-only from day one (feedback #102 precedent) — no `type` field, same
// reasoning as camp sources: every real source has been "provider_website"
// in practice, so the server hardcodes it.
export interface SportsClubSourceInput {
  name: string
  url: string
  notes: string
}

export async function createSportsClubSource(input: SportsClubSourceInput): Promise<SportsClubSource> {
  const response = await fetch(`${API_URL}/sports-club-sources`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Failed to create source: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubSourceResponse
  return body.data
}

export async function fetchSportsClubComments(id: string): Promise<SportsClubComment[]> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/comments`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`)
  }
  const body = (await response.json()) as SportsClubCommentsResponse
  return body.data
}

export async function createSportsClubComment(id: string, body: string): Promise<SportsClubComment> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as SportsClubCommentResponse
  return responseBody.data
}

export async function updateSportsClubComment(id: string, commentId: string, body: string): Promise<SportsClubComment> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to update comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as SportsClubCommentResponse
  return responseBody.data
}

export async function deleteSportsClubComment(id: string, commentId: string): Promise<void> {
  const response = await fetch(`${API_URL}/sports-clubs/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete comment: ${response.status}`)
  }
}
