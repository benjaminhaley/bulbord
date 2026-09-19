import { and, eq, gte, isNull } from 'drizzle-orm'

import { signJson, verifyJson } from '../auth/tokens.js'
import { db } from '../db/client.js'
import {
  campInterests,
  camps,
  eventInterests,
  events,
  sportsClubInterests,
  sportsClubOccurrences,
  sportsClubs,
  users,
} from '../db/schema.js'
import { addDays, todayInChicago } from '../dates.js'
import { requireEnv } from '../env.js'
import { buildIcsFeed, type FeedEntry } from './ics.js'

interface FeedTokenPayload {
  kind: 'calendar_feed'
  userId: string
}

// Same signed-JSON, no-expiry envelope as the newsletter unsubscribe token
// (newsletter/service.ts): calendar apps can't send a bearer header when
// polling a subscription, so the URL itself carries the credential. It only
// ever grants read access to that one member's own starred-item titles/dates.
function createFeedToken(userId: string): string {
  return signJson({ kind: 'calendar_feed', userId } satisfies FeedTokenPayload, requireEnv('SESSION_SECRET'))
}

function verifyFeedToken(token: string | undefined): string | null {
  const payload = token ? verifyJson<FeedTokenPayload>(token, requireEnv('SESSION_SECRET')) : null
  return payload?.kind === 'calendar_feed' ? payload.userId : null
}

export function feedUrl(userId: string): string {
  return `${requireEnv('PUBLIC_API_URL')}/calendar/feed/${createFeedToken(userId)}.ics`
}

function location(locationName: string | null, address: string | null): string | null {
  if (locationName && address) return `${locationName}, ${address}`
  return locationName ?? address
}

// Keeps a week of already-past items so a just-finished event doesn't vanish
// from the calendar the moment it ends.
const LOOKBACK_DAYS = 7

async function getInterestedEntries(userId: string): Promise<FeedEntry[]> {
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  const cutoff = addDays(todayInChicago(), -LOOKBACK_DAYS)

  const [eventRows, campRows, clubRows] = await Promise.all([
    db
      .select({ e: events })
      .from(eventInterests)
      .innerJoin(events, eq(events.id, eventInterests.eventId))
      .where(
        and(
          eq(eventInterests.userId, userId),
          eq(eventInterests.status, 'interested'),
          isNull(eventInterests.deletedAt),
          eq(events.status, 'approved'),
          isNull(events.deletedAt),
          gte(events.startDate, cutoff),
        ),
      ),
    db
      .select({ c: camps })
      .from(campInterests)
      .innerJoin(camps, eq(camps.id, campInterests.campId))
      .where(
        and(
          eq(campInterests.userId, userId),
          eq(campInterests.status, 'interested'),
          isNull(campInterests.deletedAt),
          eq(camps.status, 'approved'),
          isNull(camps.deletedAt),
          gte(camps.endDate, cutoff),
        ),
      ),
    db
      .select({ club: sportsClubs, occ: sportsClubOccurrences })
      .from(sportsClubInterests)
      .innerJoin(sportsClubs, eq(sportsClubs.id, sportsClubInterests.sportsClubId))
      .innerJoin(sportsClubOccurrences, eq(sportsClubOccurrences.sportsClubId, sportsClubs.id))
      .where(
        and(
          eq(sportsClubInterests.userId, userId),
          eq(sportsClubInterests.status, 'interested'),
          isNull(sportsClubInterests.deletedAt),
          eq(sportsClubs.status, 'approved'),
          isNull(sportsClubs.deletedAt),
          isNull(sportsClubOccurrences.deletedAt),
          gte(sportsClubOccurrences.date, cutoff),
        ),
      ),
  ])

  const entries: FeedEntry[] = []
  for (const { e } of eventRows) {
    entries.push({
      uid: `event-${e.id}@bulbord.com`,
      title: e.title,
      description: e.description,
      location: location(e.locationName, e.address),
      url: `${webUrl}/events/${e.id}`,
      startDate: e.startDate,
      startTime: e.startTime,
      endTime: e.endTime,
      allDay: e.allDay,
    })
  }
  for (const { c } of campRows) {
    // A multi-day camp is one all-day block spanning its range; only a
    // genuinely single-day camp's own hours become a timed block (same rule
    // as web/src/calendar's Add to Calendar).
    const multiDay = c.startDate !== c.endDate
    entries.push({
      uid: `camp-${c.id}@bulbord.com`,
      title: c.title,
      description: c.description,
      location: location(c.locationName, c.address),
      url: `${webUrl}/camps/${c.id}`,
      startDate: c.startDate,
      endDate: c.endDate,
      startTime: multiDay ? null : c.startTime,
      endTime: multiDay ? null : c.endTime,
      allDay: multiDay,
    })
  }
  for (const { club, occ } of clubRows) {
    entries.push({
      uid: `sports-club-${club.id}-${occ.id}@bulbord.com`,
      title: club.title,
      description: club.description,
      location: location(club.locationName, club.address),
      url: `${webUrl}/sports-clubs/${club.id}`,
      startDate: occ.date,
      startTime: occ.startTime,
      endTime: occ.endTime,
    })
  }

  return entries.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export async function renderFeedForToken(token: string | undefined): Promise<string | null> {
  const userId = verifyFeedToken(token)
  if (!userId) return null
  const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
  if (!user) return null
  return buildIcsFeed(await getInterestedEntries(userId), 'Bulbord — Interested')
}
