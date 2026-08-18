import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type InterestStatus = 'interested' | 'dismissed'

// One bookable tier of the "Options" section — label is always rendered
// bold; start_time/end_time/price/age_min/age_max are independently
// nullable (a table cell shows "—" when unknown), and `note` is a short
// freeform aside for anything that doesn't fit those columns (a weekly
// rate, a sibling discount). See api/src/db/schema.ts's CampOptionLine for
// the full rationale — this replaced a hand-formatted free-text `detail`
// blob (2026-08-05: "every option should include an age range, a time, and
// a price... consistent structured fields for each option").
export interface CampOptionLine {
  label: string
  start_time: string | null
  end_time: string | null
  price: string | null
  age_min: number | null
  age_max: number | null
  note: string | null
}

// One line of the "What to bring / prepare" section — label always bold,
// detail always plain. Deliberately kept simpler than CampOptionLine above
// (see api/src/db/schema.ts's CampPrepLine) since a packing-list item has
// no time/age/price to decompose into.
export interface CampPrepLine {
  label: string
  detail: string
}

export interface Camp {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  // Exact hours the camp runs — null means not confirmed/fixed (e.g. a
  // flexible drop-in pass), shown as "Time: not specified" rather than
  // omitted (see camps/format.ts timeLabel).
  start_time: string | null
  end_time: string | null
  address: string | null
  location_name: string | null
  distance_miles: string | null
  price_per_day: string | null
  // True when price_per_day was inferred from a provider's stated recurring
  // policy rather than an individually published listing for this exact
  // date — see api/src/camps/routes.ts. Always render this to the user.
  price_is_estimated: boolean
  // Structured tiered/add-on pricing breakdown (e.g. Fit City Kids' Day
  // camp vs. Full day + extension) — shown on the detail page's "Options"
  // section only, never in the compact price_per_day line. Only ever set by
  // a seed script.
  options: CampOptionLine[] | null
  // A short aside shown under the Options table — a sibling discount, a
  // weekly rate — for anything that isn't its own bookable tier (see
  // CampOptionLine above). Also the member self-service equivalent of the
  // whole table when a member has no real tiers to structure.
  options_note: string | null
  age_min: number | null
  age_max: number | null
  // Real-time availability isn't tracked — null means unknown, not zero.
  spots_available: number | null
  // Whether the camp's real registration system is actually open right now
  // — 'open' | 'full' | 'waitlist' | 'not_opened' | null (unresearched or
  // unconfirmable). Only ever set by a seed script (see api/src/db/schema.ts).
  booking_status: string | null
  // When/how to register — free text, always shown when present.
  booking_instructions: string | null
  // Structured "what to bring / prepare" checklist — same posture as
  // options above, simpler shape (see CampPrepLine). prep_note is the
  // member self-service equivalent.
  prep_items: CampPrepLine[] | null
  prep_note: string | null
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
// Deliberately simpler than the full Camp shape (feedback, 2026-08-05:
// "let's keep it simple for now") — a member gets one free-text aside per
// section (options_note/prep_note) rather than the structured multi-row
// options/prep_items editor a hand-seeded provider's data uses; tiered
// pricing and multi-item packing lists are a "real provider with a
// structured program" thing, not a "parent posting a one-off camp" thing.
export interface CampInput {
  title: string
  description: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  address: string
  price_per_day: number | null
  options_note: string
  age_min: number | null
  age_max: number | null
  spots_available: number | null
  booking_instructions: string
  prep_note: string
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
  camp_start_date: string
  camp_end_date: string
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

interface CampSourceResponse {
  data: CampSource
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

// Admin-only (feedback #102 follow-up, "camps... sources should be moved" —
// same treatment as events/api.ts's createEventSource). No `type` field —
// unlike events, every real camp source has been "provider_website" in
// practice, so the server hardcodes it.
export interface CampSourceInput {
  name: string
  url: string
  notes: string
}

export async function createCampSource(input: CampSourceInput): Promise<CampSource> {
  const response = await fetch(`${API_URL}/camp-sources`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Failed to create camp source: ${response.status}`)
  }
  const body = (await response.json()) as CampSourceResponse
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
