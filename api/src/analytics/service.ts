import { and, desc, eq, gte, inArray, ne, notInArray, sql } from 'drizzle-orm'

import { todayInChicago } from '../dates.js'
import { db } from '../db/client.js'
import { eventsLog, users } from '../db/schema.js'

// Feedback #96: "the basics like daily active visitors, last active by
// member, number of people viewing events, who is sharing... a simple
// logging layer for all the key actions." events_log already captures
// every mutation (see CLAUDE.md's Introspectability section) but never a
// plain read — these four are the new, deliberately narrow set of
// read/UI-triggered actions worth logging, added specifically to answer
// this feedback rather than expanding events_log's scope generally.
// `app_opened` is deduped to once per member per Chicago calendar day (see
// trackAnalyticsEvent below), which is what makes it a clean source for
// "daily active" without a separate session/heartbeat mechanism.
// "Last active by member" is a different, broader query — see its own
// comment below for why it isn't scoped to `app_opened`.
const TRACKABLE_ACTIONS = ['app_opened', 'event_viewed', 'camp_viewed', 'share_opened'] as const
export type TrackableAction = (typeof TRACKABLE_ACTIONS)[number]

export function isTrackableAction(action: string): action is TrackableAction {
  return (TRACKABLE_ACTIONS as readonly string[]).includes(action)
}

export async function trackAnalyticsEvent(actor: string, action: TrackableAction, metadata?: Record<string, unknown>) {
  if (action === 'app_opened') {
    const today = todayInChicago()
    const [existing] = await db
      .select({ id: eventsLog.id })
      .from(eventsLog)
      .where(
        and(
          eq(eventsLog.actor, actor),
          eq(eventsLog.action, 'app_opened'),
          sql`(${eventsLog.createdAt} AT TIME ZONE 'America/Chicago')::date = ${today}::date`,
        ),
      )
      .limit(1)
    if (existing) return
  }
  await db.insert(eventsLog).values({ actor, action, metadata: metadata ?? null })
}

// The "simple logging layer... visible on this same analytics view" —
// an exclusion list, not an allowlist: every real events_log action shows
// up by default, and only one-off backfill/seed/correction scripts (real,
// but not the kind of recurring "who did what, when" activity Ben asked to
// see at a glance — "not interested in all the little nitty-gritty
// details") have to opt out. The inverse (a hand-maintained allowlist)
// would silently drop any *future* ordinary mutation's action from this
// view until someone remembered to add it here — this way a forgotten
// entry only affects one-off scripts, which are rare and reviewed by hand
// anyway. `events_ingested` is deliberately not excluded — unlike the
// scripts below, it's a real recurring operational action (the "re-run
// event sourcing" admin tool, and a future daily job), one row per run.
const EXCLUDED_LOG_ACTIONS = [
  'camps_familyroom_time_backfill',
  'camps_times_backfill',
  'camps_seeded',
  'camps_structured_options_backfill',
  'event_location_names_backfilled',
  'event_source_url_corrected',
  'event_corrected',
  'events_image_backfill',
  'events_sources_refined',
  'events_title_backfill',
  'school_breaks_seeded',
  'images_guaranteed_backfill',
] as const

const DAU_WINDOW_DAYS = 30
const AGGREGATE_WINDOW_DAYS = 7
const RECENT_LOG_LIMIT = 100

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// events_log.actor is plain text (a real user id, or a system string like
// "system:newsletter-cron" / "admin:<uuid>" / "claude:...") — this is a
// name lookup by matching UUID-shaped actors against users.id, not a SQL
// join, since actor isn't a real foreign key.
function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export interface AnalyticsSummary {
  activeToday: number
  activeThisWeek: number
  eventViewers7d: number
  campViewers7d: number
  sharers7d: number
  dau: { date: string; count: number }[]
  lastActiveByMember: { userId: string; name: string; avatarUrl: string | null; lastActiveAt: Date }[]
  recentLog: { id: string; actor: string; actorName: string; action: string; metadata: unknown; createdAt: Date }[]
}

// Feedback #101: "in analytics recent activity, make it easy to include or
// exclude a person from the screen." Scoped to the recent-activity log only
// (the stat tiles/DAU chart/last-active list above it aren't what the
// feedback is about) — 'include' narrows the log to just that person's own
// actions, 'exclude' hides them (e.g. filtering out Ben's own constant
// admin/dev-tools activity to see what real members are doing).
export interface ActorFilter {
  actorId: string
  mode: 'include' | 'exclude'
}

export async function getAnalyticsSummary(actorFilter?: ActorFilter): Promise<AnalyticsSummary> {
  const today = todayInChicago()
  const dauSince = new Date(Date.now() - DAU_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const aggSince = new Date(Date.now() - AGGREGATE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const dayExpr = sql<string>`(${eventsLog.createdAt} AT TIME ZONE 'America/Chicago')::date`

  const [activeWeekRow, dauRows, lastActiveRows, viewerCounts, recentLogRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(distinct ${eventsLog.actor})::int` })
      .from(eventsLog)
      .where(and(eq(eventsLog.action, 'app_opened'), gte(eventsLog.createdAt, aggSince))),
    // `app_opened` is deduped to one row per actor per Chicago day at
    // insert time (see trackAnalyticsEvent), so count(*) per day already
    // equals a distinct-actor count — and, since this window always
    // includes today, its last row doubles as "active today" below rather
    // than needing its own separate query.
    db
      .select({ day: dayExpr, count: sql<number>`count(*)::int` })
      .from(eventsLog)
      .where(and(eq(eventsLog.action, 'app_opened'), gte(eventsLog.createdAt, dauSince)))
      .groupBy(dayExpr)
      .orderBy(dayExpr),
    // Fixed 2026-08-17 (live report: "I've been active multiple times
    // since 6 AM" while this showed a stale 6:04am timestamp) — this used
    // to be scoped to `action = 'app_opened'` only, which only fires once
    // per member per Chicago day from AuthContext's boot effect (see above)
    // and so goes stale the moment a member does real things — post
    // feedback, comment, star an event — in a session that started before
    // today's app_opened row, without ever triggering a fresh app open.
    // "Last active" now means the most recent row in events_log for that
    // actor, full stop — any real action counts, matching what an admin
    // actually means by the phrase (and matching what the Recent activity
    // log right below it already shows). Deliberately NOT applied to the
    // DAU chart/"active today"/"active this week" above, which are a
    // different, intentionally narrower concept — real login/open
    // sessions, not "did anything."
    db.select({ actor: eventsLog.actor, lastActiveAt: sql<Date>`max(${eventsLog.createdAt})` }).from(eventsLog).groupBy(eventsLog.actor),
    // One grouped query for all three "who's viewing/sharing" tiles rather
    // than three near-identical count(distinct actor)-per-action queries.
    db
      .select({ action: eventsLog.action, count: sql<number>`count(distinct ${eventsLog.actor})::int` })
      .from(eventsLog)
      .where(and(inArray(eventsLog.action, ['event_viewed', 'camp_viewed', 'share_opened']), gte(eventsLog.createdAt, aggSince)))
      .groupBy(eventsLog.action),
    db
      .select({ id: eventsLog.id, actor: eventsLog.actor, action: eventsLog.action, metadata: eventsLog.metadata, createdAt: eventsLog.createdAt })
      .from(eventsLog)
      .where(
        and(
          notInArray(eventsLog.action, EXCLUDED_LOG_ACTIONS as unknown as string[]),
          actorFilter
            ? actorFilter.mode === 'include'
              ? eq(eventsLog.actor, actorFilter.actorId)
              : ne(eventsLog.actor, actorFilter.actorId)
            : undefined,
        ),
      )
      .orderBy(desc(eventsLog.createdAt))
      .limit(RECENT_LOG_LIMIT),
  ])

  const actorIds = [...new Set([...lastActiveRows.map((r) => r.actor), ...recentLogRows.map((r) => r.actor)])].filter(isUuid)
  const members = actorIds.length
    ? await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, actorIds))
    : []
  const memberById = new Map(members.map((m) => [m.id, m]))

  const lastActiveByMember = lastActiveRows
    .map((row) => ({
      userId: row.actor,
      name: memberById.get(row.actor)?.name ?? row.actor,
      avatarUrl: memberById.get(row.actor)?.avatarUrl ?? null,
      lastActiveAt: row.lastActiveAt,
    }))
    .sort((a, b) => +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt))

  const countFor = (action: string) => viewerCounts.find((r) => r.action === action)?.count ?? 0

  return {
    activeToday: dauRows.find((r) => r.day === today)?.count ?? 0,
    activeThisWeek: activeWeekRow[0]?.count ?? 0,
    eventViewers7d: countFor('event_viewed'),
    campViewers7d: countFor('camp_viewed'),
    sharers7d: countFor('share_opened'),
    dau: dauRows.map((r) => ({ date: r.day, count: r.count })),
    lastActiveByMember,
    recentLog: recentLogRows.map((r) => ({
      id: r.id,
      actor: r.actor,
      actorName: memberById.get(r.actor)?.name ?? r.actor,
      action: r.action,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  }
}
