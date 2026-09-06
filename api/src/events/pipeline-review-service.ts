// Pipeline Review (feedback #138, 2026-09-06; extended to a real gate + full
// checklist 2026-09-06 v2 after Ben's first live look): a candidate that
// fails a check is held as `pending` (invisible to members) until it's fixed
// or an admin explicitly Approves it — a clean candidate still publishes
// immediately with zero human involvement. Backs both the admin review page
// (GET /admin/events/pipeline-review) and the weekly digest email
// (pipeline-review-email.ts).
import { and, desc, eq, gte, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events, eventSources, rejectedEventCandidates, users } from '../db/schema.js'
import { todayInChicago } from '../dates.js'
import { checkDateQuality, checkTimeQuality, buildDuplicateCheck, scoreTextChecks, type CheckResult, type PipelineChecks } from './candidate-checks.js'
import type { CandidateEvent } from './ingest.js'
import { ingestEvents } from './ingest.js'
import { enrichEventImage } from './image-enrichment.js'

export interface KeptReviewItem {
  id: string
  title: string
  sourceId: string | null
  sourceName: string | null
  createdAt: Date
  status: string
  imageUrl: string
  thumbnailUrl: string
  startDate: string
  startTime: string | null
  allDay: boolean
  address: string | null
  locationName: string | null
  description: string | null
  relevanceReason: string | null
  checks: PipelineChecks | null
  pipelineChecksPassed: boolean | null
  reviewedAt: Date | null
  reviewedByName: string | null
  reviewNote: string | null
}

export interface RejectedReviewItem {
  id: string
  title: string
  sourceId: string
  sourceName: string | null
  candidateData: CandidateEvent
  rejectionType: string
  rejectionReason: string
  duplicateOfEventId: string | null
  duplicateOfEventTitle: string | null
  checks: PipelineChecks | null
  createdAt: Date
  reviewedAt: Date | null
  reviewedByName: string | null
  reviewAction: string | null
  reviewNote: string | null
  addedAsEventId: string | null
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
      status: events.status,
      imageUrl: events.imageUrl,
      thumbnailUrl: events.thumbnailUrl,
      startDate: events.startDate,
      startTime: events.startTime,
      allDay: events.allDay,
      address: events.address,
      locationName: events.locationName,
      description: events.description,
      relevanceReason: events.pipelineRelevanceReason,
      checks: events.pipelineQualityChecks,
      pipelineChecksPassed: events.pipelineChecksPassed,
      pipelineReviewedAt: events.pipelineReviewedAt,
      reviewedByName: users.name,
      pipelineReviewNote: events.pipelineReviewNote,
    })
    .from(events)
    .leftJoin(eventSources, eq(eventSources.id, events.sourceId))
    .leftJoin(users, eq(users.id, events.pipelineReviewedByUserId))
    .where(since ? and(where, gte(events.createdAt, since)) : where)
    .orderBy(desc(events.createdAt))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    createdAt: r.createdAt,
    status: r.status,
    imageUrl: r.imageUrl,
    thumbnailUrl: r.thumbnailUrl,
    startDate: r.startDate,
    startTime: r.startTime,
    allDay: r.allDay,
    address: r.address,
    locationName: r.locationName,
    description: r.description,
    relevanceReason: r.relevanceReason,
    checks: (r.checks as PipelineChecks | null) ?? null,
    pipelineChecksPassed: r.pipelineChecksPassed,
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
      candidateData: rejectedEventCandidates.candidateData,
      rejectionType: rejectedEventCandidates.rejectionType,
      rejectionReason: rejectedEventCandidates.rejectionReason,
      duplicateOfEventId: rejectedEventCandidates.duplicateOfEventId,
      duplicateOfEventTitle: duplicateOfEvents.title,
      checks: rejectedEventCandidates.checks,
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

  return rows.map((r) => ({ ...r, candidateData: r.candidateData as CandidateEvent, checks: r.checks as PipelineChecks | null }))
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

// Approve always publishes (status='approved'), whether the item was
// `pending` (a check-failing candidate — this is the human override that
// actually makes it go live) or already `approved` (just acknowledges it).
export async function approveEvent(eventId: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(events).set({
    status: 'approved',
    pipelineReviewedAt: new Date(),
    pipelineReviewedByUserId: adminId,
    pipelineReviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), isNull(events.deletedAt))).returning({ id: events.id })
  return row ? null : 'not_found'
}

export async function rejectEvent(eventId: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(events).set({
    deletedAt: new Date(),
    pipelineReviewedAt: new Date(),
    pipelineReviewedByUserId: adminId,
    pipelineReviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(events.id, eventId), isNull(events.deletedAt))).returning({ id: events.id })
  return row ? null : 'not_found'
}

export type EditableFields = Partial<{ title: string; description: string; address: string; locationName: string; startDate: string; startTime: string | null; allDay: boolean }>

// Edit only ever corrects data and re-scores the checklist — it never
// changes publish state (Approve/Reject remain the only two actions that
// do), so an admin fixing a field doesn't have to guess whether that also
// silently published something. Re-runs the text checks (no retry — a human
// already tried to fix it) plus the deterministic date/time checks against
// the new values; the image checks and duplicateCheck carry over unchanged
// from what's already stored (edit doesn't touch the image — see
// retryEventImageForKeptItem for that).
export async function editKeptCandidate(eventId: string, fields: EditableFields): Promise<PipelineReviewActionError | null> {
  const [existing] = await db
    .select({ checks: events.pipelineQualityChecks, title: events.title, description: events.description, address: events.address, locationName: events.locationName, startDate: events.startDate, startTime: events.startTime, allDay: events.allDay })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!existing) return 'not_found'

  const merged = { ...existing, ...fields }
  const priorChecks = existing.checks as PipelineChecks | null
  const [textChecks] = (await scoreTextChecks([{ title: merged.title, description: merged.description ?? undefined, address: merged.address ?? undefined, locationName: merged.locationName ?? undefined }])) ?? []

  const checks: PipelineChecks = {
    titleQuality: textChecks?.titleQuality ?? priorChecks?.titleQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    descriptionQuality: textChecks?.descriptionQuality ?? priorChecks?.descriptionQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    locationLabelQuality: textChecks?.locationLabelQuality ?? priorChecks?.locationLabelQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    addressQuality: textChecks?.addressQuality ?? priorChecks?.addressQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    dateQuality: checkDateQuality(merged.startDate, todayInChicago()),
    timeQuality: checkTimeQuality(merged.startTime ?? undefined, merged.allDay),
    imageQuality: priorChecks?.imageQuality ?? { pass: true, reason: 'Unchanged by this edit', attempts: 1 },
    imageRelevance: priorChecks?.imageRelevance ?? { pass: true, reason: 'Unchanged by this edit', attempts: 1 },
    duplicateCheck: priorChecks?.duplicateCheck ?? buildDuplicateCheck(),
  }
  const pipelineChecksPassed = Object.values(checks).every((c) => c.pass)

  await db.update(events).set({ ...fields, pipelineQualityChecks: checks, pipelineChecksPassed, updatedAt: new Date() }).where(eq(events.id, eventId))
  return null
}

// Deliberately does NOT mark the event reviewed, and only auto-publishes
// when *every* other check already passes — an admin still needs to look at
// a still-imperfect result and decide Approve/Reject, same "Edit never
// changes publish state by itself" rule editKeptCandidate follows, except
// here the exception is deliberate: "fixed the last thing wrong with it"
// should actually go live, not need a separate click.
export async function retryEventImageForKeptItem(eventId: string): Promise<PipelineReviewActionError | 'no_image_found' | null> {
  const [row] = await db
    .select({ id: events.id, sourceUrl: events.sourceUrl, title: events.title, description: events.description, checks: events.pipelineQualityChecks, status: events.status })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!row) return 'not_found'

  // enrichEventImage() (the singular, per-event function) doesn't fail open
  // on its own — only the batch enrichEventImages() used during ingestion
  // wraps it in try/catch. An admin retrying a specific event's image is
  // just as exposed to a real download/processing failure (a corrupted
  // JPEG, a network error) as a fresh ingest is, so this call site needs
  // the same fail-open handling rather than 500ing the whole action.
  let result: Awaited<ReturnType<typeof enrichEventImage>>['result'] = 'none'
  let imageQuality: CheckResult
  let imageRelevance: CheckResult
  try {
    ;({ result, imageQuality, imageRelevance } = await enrichEventImage(
      row.id,
      { sourceUrl: row.sourceUrl, title: row.title, description: row.description },
      { scoreLogos: true },
    ))
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    imageQuality = { pass: false, reason: `Image search errored: ${reason}`, attempts: 1 }
    imageRelevance = { pass: false, reason: 'Not scored — the search itself errored', attempts: 1 }
  }

  const priorChecks = row.checks as PipelineChecks | null
  const checks: PipelineChecks = { ...(priorChecks ?? ({} as PipelineChecks)), imageQuality, imageRelevance }
  const pipelineChecksPassed = Object.values(checks).every((c) => c?.pass)

  await db.update(events).set({
    pipelineQualityChecks: checks,
    pipelineChecksPassed,
    status: pipelineChecksPassed ? 'approved' : row.status,
    updatedAt: new Date(),
  }).where(eq(events.id, eventId))

  return result === 'sourced' ? null : 'no_image_found'
}

export async function rejectRejectedCandidate(id: string, adminId: string, note?: string | null): Promise<PipelineReviewActionError | null> {
  const [row] = await db.update(rejectedEventCandidates).set({
    reviewedAt: new Date(),
    reviewedByUserId: adminId,
    reviewAction: 'rejected',
    reviewNote: note ?? null,
    updatedAt: new Date(),
  }).where(and(eq(rejectedEventCandidates.id, id), isNull(rejectedEventCandidates.deletedAt))).returning({ id: rejectedEventCandidates.id })
  return row ? null : 'not_found'
}

// Edit only ever corrects the stored candidateData snapshot — it never
// inserts anything. Approve is still the separate, explicit step that
// commits it (see approveRejectedCandidate below) — same "Edit never
// changes publish state" rule as the kept-item version.
export async function editRejectedCandidate(id: string, fields: EditableFields): Promise<PipelineReviewActionError | null> {
  const [row] = await db
    .select({ candidateData: rejectedEventCandidates.candidateData, checks: rejectedEventCandidates.checks })
    .from(rejectedEventCandidates)
    .where(and(eq(rejectedEventCandidates.id, id), isNull(rejectedEventCandidates.deletedAt)))
    .limit(1)
  if (!row) return 'not_found'

  const candidate = { ...(row.candidateData as CandidateEvent), ...fields }
  const priorChecks = row.checks as PipelineChecks | null
  const [textChecks] = (await scoreTextChecks([{ title: candidate.title, description: candidate.description, address: candidate.address, locationName: candidate.locationName }])) ?? []
  const checks: PipelineChecks = {
    titleQuality: textChecks?.titleQuality ?? priorChecks?.titleQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    descriptionQuality: textChecks?.descriptionQuality ?? priorChecks?.descriptionQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    locationLabelQuality: textChecks?.locationLabelQuality ?? priorChecks?.locationLabelQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    addressQuality: textChecks?.addressQuality ?? priorChecks?.addressQuality ?? { pass: true, reason: 'Not re-scored', attempts: 1 },
    dateQuality: checkDateQuality(candidate.startDate, todayInChicago()),
    timeQuality: checkTimeQuality(candidate.startTime ?? undefined, candidate.allDay),
    imageQuality: priorChecks?.imageQuality ?? { pass: true, reason: 'Not attempted — rejected before an image search', attempts: 0 },
    imageRelevance: priorChecks?.imageRelevance ?? { pass: true, reason: 'Not attempted — rejected before an image search', attempts: 0 },
    duplicateCheck: priorChecks?.duplicateCheck ?? buildDuplicateCheck(),
  }
  await db.update(rejectedEventCandidates).set({ candidateData: candidate, checks, updatedAt: new Date() }).where(eq(rejectedEventCandidates.id, id))
  return null
}

// Rebuilds a CandidateEvent from the persisted (possibly admin-edited)
// snapshot and runs it back through the exact same ingestEvents() path
// everything else uses (dedup, placeholder image, real image enrichment,
// the full checklist) — the whole reason candidateData was captured in the
// first place (see ingest.ts). forceApprove: true because this is an
// explicit human decision to publish, not a candidate the automated
// pipeline is discovering fresh — the checklist still runs and is still
// recorded, it just doesn't hold this one back. If it dedupes against
// something inserted since the original rejection, that's a genuine no-op
// skip, surfaced honestly rather than papered over.
export async function approveRejectedCandidate(
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
  const { inserted } = await ingestEvents([candidate], { sourceId: row.eventSourceId, actor: adminId, forceApprove: true })

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
    reviewAction: 'approved',
    reviewNote: note ?? null,
    addedAsEventId,
    updatedAt: new Date(),
  }).where(eq(rejectedEventCandidates.id, id))

  return inserted > 0 ? null : 'deduped'
}
