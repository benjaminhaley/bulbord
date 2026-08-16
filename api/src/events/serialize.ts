import { sql, type SQLWrapper } from 'drizzle-orm'

import { events, eventInterests, users } from '../db/schema.js'
import { canEditEvent } from './permissions.js'

export type InterestStatus = 'interested' | 'dismissed'

export type SerializableEvent = Pick<
  typeof events.$inferSelect,
  | 'id'
  | 'title'
  | 'description'
  | 'startDate'
  | 'startTime'
  | 'allDay'
  | 'address'
  | 'locationName'
  | 'latitude'
  | 'longitude'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
  | 'submittedByUserId'
  | 'topic'
>

// Small icon-stack teaser (feedback #43 — replaced a text-name teaser), so
// the closed state needs a photo/initials per person, not just a name.
export type InterestedPersonSummary = { name: string; avatar_url: string | null }

// null for system-sourced events (no submitter to show); present for member
// self-service posts (feedback #46), so the frontend can attribute the post
// and fall back to the poster's own photo as a placeholder image when the
// event has no image of its own (feedback, 2026-08-03).
export type SubmitterSummary = { name: string; avatar_url: string | null }

// Extracted out of routes.ts (feedback #97) so events/week-query.ts can
// build the same serialized shape for the calendar week view without a
// circular import back into routes.ts.
export function serializeEvent(
  e: SerializableEvent,
  interestStatus: InterestStatus | null,
  interestedCount: number,
  interestedPeople: InterestedPersonSummary[],
  currentUserId: string | null,
  submittedBy: SubmitterSummary | null,
) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start_date: e.startDate,
    start_time: e.startTime,
    all_day: e.allDay,
    address: e.address,
    location_name: e.locationName,
    latitude: e.latitude,
    longitude: e.longitude,
    source_url: e.sourceUrl,
    image_url: e.imageUrl,
    thumbnail_url: e.thumbnailUrl,
    topic: e.topic,
    interest_status: interestStatus,
    interested_count: interestedCount,
    interested_people: interestedPeople,
    // Creator-only edit/delete (feedback #46) — no admin override, same
    // posture as feedback-post edits (feedback #39).
    can_edit: currentUserId !== null && canEditEvent({ id: currentUserId }, e),
    submitted_by: submittedBy,
  }
}

// Correlated scalar subqueries — fine for a single row (GET /events/:id) or
// a small range (GET /events/week), but the paginated list route aggregates
// via a joined CTE instead so it doesn't re-scan event_interests once per
// returned row.
//
// CAUTION: drizzle only table-qualifies a raw sql`` column interpolation
// (e.g. the `${eventId}` below) when the surrounding query already involves
// more than one table — a caller with a single-table outer query would
// silently get this wrong (see the event_count fix on GET /event-sources,
// which hit exactly this and had to use a real join instead).
export function interestedCountExpr(eventId: SQLWrapper) {
  return sql<number>`(select count(*)::int from ${eventInterests} where ${eventInterests.eventId} = ${eventId} and ${eventInterests.status} = 'interested' and ${eventInterests.deletedAt} is null)`
}

// Name+avatar in interest-order, with the current viewer's own name swapped
// for "You" — same substitution the paginated list's interest_people CTE
// applies. Carries avatar_url (not just name) so the closed-state teaser can
// render a small icon stack instead of text (feedback #43).
export function interestedPeopleExpr(eventId: SQLWrapper, userId: string | null) {
  return sql<InterestedPersonSummary[]>`(select coalesce(json_agg(json_build_object('name', case when ${eventInterests.userId} = ${userId} then 'You' else ${users.name} end, 'avatar_url', ${users.avatarUrl}) order by ${eventInterests.createdAt}), '[]'::json) from ${eventInterests} join ${users} on ${users.id} = ${eventInterests.userId} where ${eventInterests.eventId} = ${eventId} and ${eventInterests.status} = 'interested' and ${eventInterests.deletedAt} is null)`
}

// Scalar subquery, not a join — mirrors interestedCountExpr/interestedPeopleExpr
// above. Naturally yields SQL NULL (not an error) when submittedByUserId
// itself is NULL (system-sourced events), since the WHERE clause then
// matches no row.
export function submittedByExpr(submittedByUserId: SQLWrapper) {
  return sql<SubmitterSummary | null>`(select json_build_object('name', ${users.name}, 'avatar_url', ${users.avatarUrl}) from ${users} where ${users.id} = ${submittedByUserId})`
}
