import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campInterests, camps, schoolBreaks, users } from '../db/schema.js'

interface InterestedPerson {
  id: string
  name: string
  avatarUrl: string | null
}

export interface ReminderCamp {
  id: string
  title: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  address: string | null
  locationName: string | null
  distanceMiles: string | null
  pricePerDay: string | null
  priceIsEstimated: boolean
  ageMin: number | null
  ageMax: number | null
  spotsAvailable: number | null
  bookingStatus: string | null
  thumbnailUrl: string | null
  interestedCount: number
  interestedNames: InterestedPerson[]
}

// Every approved, non-deleted camp whose date range overlaps [fromDate,
// toDate] — a school break's own window. Mirrors the overlap test
// camps/grouping.ts's rangesOverlap uses for the in-app accordion, but run
// as SQL rather than fetched-then-filtered-in-TS, since (unlike grouping.ts,
// which buckets the whole Camps tab's camps against every break at once)
// this is only ever called for one break's range at a time. Interested
// names carry each person's id (not a pre-substituted "You") — one query
// result is rendered once per recipient, so the "You" swap happens
// per-recipient at render time instead, same split as newsletter/query.ts.
export async function getCampsForDateRange(fromDate: string, toDate: string): Promise<ReminderCamp[]> {
  const interestCounts = db.$with('interest_counts').as(
    db
      .select({
        campId: campInterests.campId,
        interestedCount: sql<number>`count(*) filter (where ${campInterests.status} = 'interested')::int`.as(
          'interested_count',
        ),
        interestedNames: sql<InterestedPerson[]>`coalesce(json_agg(json_build_object('id', ${campInterests.userId}, 'name', ${users.name}, 'avatarUrl', ${users.avatarUrl}) order by ${campInterests.createdAt}) filter (where ${campInterests.status} = 'interested'), '[]'::json)`.as(
          'interested_names',
        ),
      })
      .from(campInterests)
      .innerJoin(users, eq(users.id, campInterests.userId))
      .where(isNull(campInterests.deletedAt))
      .groupBy(campInterests.campId),
  )

  return db
    .with(interestCounts)
    .select({
      id: camps.id,
      title: camps.title,
      startDate: camps.startDate,
      endDate: camps.endDate,
      startTime: camps.startTime,
      endTime: camps.endTime,
      address: camps.address,
      locationName: camps.locationName,
      distanceMiles: camps.distanceMiles,
      pricePerDay: camps.pricePerDay,
      priceIsEstimated: camps.priceIsEstimated,
      ageMin: camps.ageMin,
      ageMax: camps.ageMax,
      spotsAvailable: camps.spotsAvailable,
      bookingStatus: camps.bookingStatus,
      thumbnailUrl: camps.thumbnailUrl,
      interestedCount: sql<number>`coalesce(${interestCounts.interestedCount}, 0)`,
      interestedNames: sql<InterestedPerson[]>`coalesce(${interestCounts.interestedNames}, '[]'::json)`,
    })
    .from(camps)
    .leftJoin(interestCounts, eq(interestCounts.campId, camps.id))
    .where(
      and(
        eq(camps.status, 'approved'),
        isNull(camps.deletedAt),
        sql`${camps.startDate} <= ${toDate} and ${camps.endDate} >= ${fromDate}`,
      ),
    )
    .orderBy(asc(camps.title))
}

export interface CandidateBreak {
  id: string
  name: string
  startDate: string
  endDate: string
  remindedAt: Date | null
}

// Every not-yet-fully-passed, non-summer school break, oldest-starting
// first — splitWeekly (Summer Break) is excluded on purpose: it's a ~10-week
// planned break members already browse week-by-week on the Camps tab, not
// an easy-to-forget single "day off," which is what feedback #120's
// reminder is actually for. Callers filter this small candidate set down to
// what's actually due (window.ts's isReminderDue) and what actually has
// camps listed (getCampsForDateRange) — kept as two separate steps, same as
// camps/grouping.ts fetching everything and filtering in TS, since
// school_breaks is a handful of rows.
export async function getCandidateBreaks(today: string): Promise<CandidateBreak[]> {
  return db
    .select({
      id: schoolBreaks.id,
      name: schoolBreaks.name,
      startDate: schoolBreaks.startDate,
      endDate: schoolBreaks.endDate,
      remindedAt: schoolBreaks.remindedAt,
    })
    .from(schoolBreaks)
    .where(and(eq(schoolBreaks.splitWeekly, false), isNull(schoolBreaks.deletedAt), gte(schoolBreaks.endDate, today)))
    .orderBy(asc(schoolBreaks.startDate))
}

export async function markBreakReminded(id: string): Promise<void> {
  await db
    .update(schoolBreaks)
    .set({ remindedAt: new Date(), updatedAt: new Date() })
    .where(eq(schoolBreaks.id, id))
}
