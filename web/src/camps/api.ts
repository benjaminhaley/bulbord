import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type InterestStatus = 'interested' | 'dismissed'

export interface Camp {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  address: string | null
  location_name: string | null
  distance_miles: string | null
  price_per_day: string | null
  // True when price_per_day was inferred from a provider's stated recurring
  // policy rather than an individually published listing for this exact
  // date — see api/src/camps/routes.ts. Always render this to the user.
  price_is_estimated: boolean
  age_min: number | null
  age_max: number | null
  source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
  interest_status: InterestStatus | null
  interested_count: number
  interested_people: { name: string; avatar_url: string | null }[]
  can_edit: boolean
  submitted_by: { name: string; avatar_url: string | null } | null
  source: { id: string; name: string } | null
}

// Fields a member supplies when submitting or editing their own camp. Only
// title, address ("location"), and start_date are required — end_date
// defaults to start_date server-side when left blank (a single-day camp).
export interface CampInput {
  title: string
  description: string
  start_date: string
  end_date: string
  address: string
  price_per_day: number | null
  age_min: number | null
  age_max: number | null
  source_url: string
  image_url: string | null
  thumbnail_url: string | null
}

export interface InterestedUser {
  id: string
  name: string
  avatar_url: string | null
}

export interface CampComment {
  id: string
  camp_id: string
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
  camp_id: string
  camp_title: string
}

export interface CampSource {
  id: string
  name: string
  url: string
  type: string
  // Camps from this source that are actually approved + upcoming right now.
  camp_count: number
}

interface SourceCamp {
  id: string
  title: string
  start_date: string
  end_date: string
  status: string
}

export interface CampSourceDetail extends CampSource {
  notes: string | null
  is_active: boolean
  last_checked_at: string | null
  last_camp_added_at: string | null
  is_stale: boolean
  camps: SourceCamp[]
}

export interface BreakBucket {
  id: string
  break_id: string
  name: string
  label: string
  start_date: string
  end_date: string
  is_weekly_bucket: boolean
  camp_count: number
  camps: Camp[]
}

interface CampsByBreakResponse {
  data: BreakBucket[]
}

interface CampResponse {
  data: Camp
}

interface CampSourcesResponse {
  data: CampSource[]
}

interface CampSourceDetailResponse {
  data: CampSourceDetail
}

interface CampCommentsResponse {
  data: CampComment[]
}

interface CampCommentResponse {
  data: CampComment
}

interface InterestedUsersResponse {
  data: InterestedUser[]
}

interface SourceNotesResponse {
  data: SourceNote[]
}

export async function fetchCampsByBreak(): Promise<BreakBucket[]> {
  const response = await fetch(`${API_URL}/camps/by-break`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch camps: ${response.status}`)
  }
  const body = (await response.json()) as CampsByBreakResponse
  return body.data
}

export async function fetchCamp(id: string): Promise<Camp> {
  const response = await fetch(`${API_URL}/camps/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch camp: ${response.status}`)
  }
  const body = (await response.json()) as CampResponse
  return body.data
}

export async function createCamp(input: CampInput): Promise<Camp> {
  const response = await fetch(`${API_URL}/camps`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to create camp: ${response.status}`)
  }
  const body = (await response.json()) as CampResponse
  return body.data
}

export async function updateCamp(id: string, input: CampInput): Promise<Camp> {
  const response = await fetch(`${API_URL}/camps/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(`Failed to update camp: ${response.status}`)
  }
  const body = (await response.json()) as CampResponse
  return body.data
}

export async function deleteCamp(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/camps/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to delete camp: ${response.status}`)
  }
}

export async function setCampInterest(id: string, status: InterestStatus): Promise<void> {
  const response = await fetch(`${API_URL}/camps/${id}/interest`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set camp interest: ${response.status}`)
  }
}

export async function clearCampInterest(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/camps/${id}/interest`, { method: 'DELETE', headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to clear camp interest: ${response.status}`)
  }
}

export async function fetchInterestedCampUsers(id: string): Promise<InterestedUser[]> {
  const response = await fetch(`${API_URL}/camps/${id}/interested`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch interested users: ${response.status}`)
  }
  const body = (await response.json()) as InterestedUsersResponse
  return body.data
}

export async function fetchCampSourceNotes(id: string): Promise<SourceNote[]> {
  const response = await fetch(`${API_URL}/camps/${id}/source-notes`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch source notes: ${response.status}`)
  }
  const body = (await response.json()) as SourceNotesResponse
  return body.data
}

export async function fetchCampSources(): Promise<CampSource[]> {
  const response = await fetch(`${API_URL}/camp-sources`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch camp sources: ${response.status}`)
  }
  const body = (await response.json()) as CampSourcesResponse
  return body.data
}

export async function fetchCampSource(id: string): Promise<CampSourceDetail> {
  const response = await fetch(`${API_URL}/camp-sources/${id}`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch camp source: ${response.status}`)
  }
  const body = (await response.json()) as CampSourceDetailResponse
  return body.data
}

export async function fetchCampComments(id: string): Promise<CampComment[]> {
  const response = await fetch(`${API_URL}/camps/${id}/comments`, { headers: authHeaders() })
  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`)
  }
  const body = (await response.json()) as CampCommentsResponse
  return body.data
}

export async function createCampComment(id: string, body: string): Promise<CampComment> {
  const response = await fetch(`${API_URL}/camps/${id}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as CampCommentResponse
  return responseBody.data
}

export async function updateCampComment(id: string, commentId: string, body: string): Promise<CampComment> {
  const response = await fetch(`${API_URL}/camps/${id}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!response.ok) {
    throw new Error(`Failed to update comment: ${response.status}`)
  }
  const responseBody = (await response.json()) as CampCommentResponse
  return responseBody.data
}

export async function deleteCampComment(id: string, commentId: string): Promise<void> {
  const response = await fetch(`${API_URL}/camps/${id}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(`Failed to delete comment: ${response.status}`)
  }
}
