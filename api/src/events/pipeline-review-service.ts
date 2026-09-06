// Pipeline Review (feedback #138, 2026-09-06): a post-hoc admin audit layer
// on top of the sourcing pipeline — events still publish immediately (the
// 2026-09-03 "goes straight to approved" decision), this is for looking back
// at what the pipeline did and, where it got something wrong, fixing it.
// Backs both the admin review page (GET /admin/events/pipeline-review) and
// the weekly digest email (pipeline-review-email.ts).
import { and, desc, eq, gte, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventSources, eventsLog, rejectedEventCandidates, users } from '../db/schema.js'
import type { CandidateQualityChecks } from './candidate-validation.js'
import type { CandidateEvent } from './ingest.js'
import { ingestEvents } from './ingest.js'
import { enrichEventImage, type EventImageTrace } from './image-enrichment.js'

export interface KeptReviewItem {
  id: string
  title: string
  sourceId: string | null
  sourceName: string | null
  createdAt: Date
  relevanceReason: string | null
  qualityChecks: CandidateQualityChecks | null
  imageTrace: EventImageTrace['trace'] | null
  reviewedAt: Date | null
  reviewedByName: string | null
  reviewNote: string | null
}

export interface RejectedReviewItem {
  id: string
  title: string
  sourceId: string
  sourceName: string | null
  rejectionType: string
  rejectionReason: string
  duplicateOfEventId: string | null
  duplicateOfEventTitle: string | null
  createdAt: Date
  reviewedAt: Date | null
  reviewedByName: string | null
  reviewAction: string | null
  reviewNote: string | null
  addedAsEventId: string | null
}

// Looks up each kept event's own image-enrichment trace out of the
// events_ingested log rows ingestEvents() already writes (see ingest.ts) —
// no new column needed for this, following this codebase's existing
// "events_log is the debuggability record" convention (CLAUDE.md's Images &
// object storage section). Scoped to a bounded number of recent rows since
// this is a look-back tool, not a full historical index.
const RECENT_INGEST_LOG_ROWS = 200

async function loadImageTraces(eventIds: string[]): Promise<Map<string, EventImageTrace['trace']>> {
  const map = new Map<string, EventImageTrace['trace']>()
  if (eventIds.length === 0) return map
  const wanted = new Set(eventIds)
  const rows = await db
    .select({ metadata: eventsLog.metadata })
    .from(eventsLog)
    .where(eq(eventsLog.action, 'events_ingested'))
    .orderBy(desc(eventsLog.createdAt))
    .limit(RECENT_INGEST_LOG_ROWS)
  for (const row of rows) {
    const traces = (row.metadata as { imageTraces?: EventImageTrace[] } | null)?.imageTraces ?? []
    for (const t of traces) {
      if (wanted.has(t.eventId) && !map.has(t.eventId)) map.set(t.eventId, t.trace)
    }
  }
  return map
}

// A kept candidate is any event ingestEvents() produced — identified by
// submittedByUserId being null (system-sourced, per events.submittedByUserId's
// own doc comment) rather than by sourceId, since a member's own self-service
// post can also carry a sourceId (see events/routes.ts's
// registerDiscoveredEventSource) when they supply their own source URL.
function keptCandidateWhere(includeReviewed: boolean) {
  const base = and(isNull(events.deletedAt), isNull(events.submittedByUserId))
  return includeReviewed ? base : and(base, isNull(events.pipelineReviewedAt))
}

async function loadKeptItems(where: ReturnType<typeof keptCandidateWhere>, since?: Date): Promise<KeptReviewItem[]> {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      sourceId: events.sourceId,
      sourceName: eventSources.name,
      createdAt: events.createdAt,
      relevanceReason: events.pipelineRelevanceReason,
      qualityChecks: events.pipelineQualityChecks,
      pipelineReviewedAt: events.pipelineReviewedAt,
      reviewedByName: users.name,
      pipelineReviewNote: events.pipelineReviewNote,
    })
    .from(events)
    .leftJoin(eventSources, eq(eventSources.id, events.sourceId))
    .leftJoin(users, eq(users.id, events.pipelineReviewedByUserId))
    .where(since ? and(where, gte(events.createdAt, since)) : where)
    .orderBy(desc(events.createdAt))

  const traceMap = await loadImageTraces(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    createdAt: r.createdAt,
    relevanceReason: r.relevanceReason,
    qualityChecks: (r.qualityChecks as CandidateQualityChecks | null) ?? null,
    imageTrace: traceMap.get(r.id) ?? null,
    reviewedAt: r.pipelineReviewedAt,
    reviewedByName: r.reviewedByName,
    reviewNote: r.pipelineReviewNote,
  }))
}

function rejectedCandidateWhere(includeReviewed: boolean) {
  const base = isNull(rejectedEventCandidates.deletedAt)
  return includeReviewed ? base : and(base, isNull(rejectedEventCandidates.reviewedAt))
}

async function loadRejectedItems(where: ReturnType<typeof rejectedCandidateWhere>, since?: Date): Promise<RejectedReviewItem[]> {
  const duplicateOfEvents = events
  const rows = await db
    .select({
      id: rejectedEventCandidates.id,
      title: rejectedEventCandidates.title,
      sourceId: rejectedEventCandidates.eventSourceId,
      sourceName: eventSources.name,
      rejectionType: rejectedEventCandidates.rejectionType,
      rejectionReason: rejectedEventCandidates.rejectionReason,
      duplicateOfEventId: rejectedEventCandidates.duplicateOfEventId,
      duplicateOfEventTitle: duplicateOfEvents.title,
      createdAt: rejectedEventCandidates.createdAt,
      reviewedAt: rejectedEventCandidates.reviewedAt,
      reviewedByName: users.name,
      reviewAction: rejectedEventCandidates.reviewAction,
      reviewNote: rejectedEventCandidates.reviewNote,
      addedAsEventId: rejectedEventCandidates.addedAsEventId,
    })
    .from(rejectedEventCandidates)
    .leftJoin(eventSources, eq(eventSources.id, rejectedEventCandidates.eventSourceId))
    .leftJoin(duplicateOfEvents, eq(duplicateOfEvents.id, rejectedEventCandidates.duplicateOfEventId))
    .leftJoin(users, eq(users.id, rejectedEventCandidates.reviewedByUserId))
    .where(since ? and(where, gte(rejectedEventCandidates.createdAt, since)) : where)
    .orderBy(desc(rejectedEventCandidates.createdAt))

  return rows
}

// Backs the admin review page — unreviewed-by-default across all time
// (matching this codebase's other admin nudges: a missed week never
// silently drops off the list), with includeReviewed to also see history.
export async function getPipelineReviewCandidates(options: { includeReviewed?: boolean } = {}) {
  const includeReviewed = options.includeReviewed ?? false
  const [kept, rejected] = await Promise.all([
    loadKeptItems(keptCandidateWhere(includeReviewed)),
    loadRejectedItems(rejectedCandidateWhere(includeReviewed)),
  ])
  return { kept, rejected }
}

// Backs the weekly digest email — scoped to exactly what one run produced
// (createdAt >= runStartedAt, captured by the caller before the run), not
// "everything currently unreviewed," so the email reads as a per-run digest
// rather than growing to cover an ever-larger backlog.
export async function getPipelineReviewCandidatesSince(runStartedAt: Date) {
  const [kept, rejected] = await Promise.all([
    loadKeptItems(keptCandidateWhere(true), runStartedAt),
    loadRejectedItems(rejectedCandidateWhere(true), runStartedAt),
  ])
  return { kept, rejected }
}

export type PipelineReviewActionError = 'not_found'

export async function approveEvent(eventId: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(events).set({
    pipelineReviewedAt: new Date(),
    pipelineReviewedByUserId: adminId,
    pipelineReviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), isNull(events.deletedAt))).returning({ id: events.id })
  return row ? null : 'not_found'
}

export async function removeEvent(eventId: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(events).set({
    deletedAt: new Date(),
    pipelineReviewedAt: new Date(),
    pipelineReviewedByUserId: adminId,
    pipelineReviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), isNull(events.deletedAt))).returning({ id: events.id })
  return row ? null : 'not_found'
}

// Deliberately does NOT mark the event reviewed — an admin still needs to
// look at whatever the retry actually found and decide Approve/Remove, same
// reasoning this feature's plan gives for keeping the two actions separate.
export async function retryEventImage(eventId: string): Promise<PipelineReviewActionError | 'no_image_found' | null> {
  const [row] = await db
    .select({ id: events.id, sourceUrl: events.sourceUrl, title: events.title, description: events.description })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!row) return 'not_found'
  const { result } = await enrichEventImage(
    row.id,
    { sourceUrl: row.sourceUrl, title: row.title, description: row.description },
    { scoreLogos: true },
  )
  return result === 'sourced' ? null : 'no_image_found'
}

export async function agreeRejection(id: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(rejectedEventCandidates).set({
    reviewedAt: new Date(),
    reviewedByUserId: adminId,
    reviewAction: 'agreed',
    reviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(rejectedEventCandidates.id, id), isNull(rejectedEventCandidates.deletedAt))).returning({ id: rejectedEventCandidates.id })
  return row ? null : 'not_found'
}

// Rebuilds a CandidateEvent from the persisted snapshot and runs it back
// through the exact same ingestEvents() path everything else uses (dedup,
// placeholder image, real image enrichment) — the whole reason
// candidateData was captured in the first place (see ingest.ts). If it
// dedupes against something inserted since the original rejection, this is
// a genuine no-op skip, surfaced honestly rather than papered over.
export async function addRejectionAnyway(
  id: string,
  adminId: string,
  note?: string | null,
): Promise<PipelineReviewActionError | 'deduped' | null> {
  const [row] = await db
    .select()
    .from(rejectedEventCandidates)
    .where(and(eq(rejectedEventCandidates.id, id), isNull(rejectedEventCandidates.deletedAt)))
    .limit(1)
  if (!row) return 'not_found'

  const candidate = row.candidateData as CandidateEvent
  const before = new Date()
  const { inserted } = await ingestEvents([candidate], { sourceId: row.eventSourceId, actor: adminId })

  // Looked up by (sourceUrl, startDate, createdAt >= before) rather than
  // title — ingestEvents() runs the candidate's title through
  // simplifyTitle() before inserting, so the stored title can legitimately
  // differ from candidateData's own raw title.
  let addedAsEventId: string | null = null
  if (inserted > 0) {
    const [added] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.sourceUrl, candidate.sourceUrl), eq(events.startDate, candidate.startDate), gte(events.createdAt, before)))
      .orderBy(desc(events.createdAt))
      .limit(1)
    addedAsEventId = added?.id ?? null
  }

  await db.update(rejectedEventCandidates).set({
    reviewedAt: new Date(),
    reviewedByUserId: adminId,
    reviewAction: 'added_anyway',
    reviewNote: note ?? null,
    addedAsEventId,
    updatedAt: new Date(),
  }).where(eq(rejectedEventCandidates.id, id))

  return inserted > 0 ? null : 'deduped'
}
