// Feedback #141 (2026-09-07): one shared, generic edit-history mechanism for
// events/camps/sports_clubs — see api/src/db/schema.ts's entityEdits table
// comment for why this is one table/module rather than three parallel ones.
import { and, desc, eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { entityEdits, users } from '../db/schema.js'

export type EntityType = 'event' | 'camp' | 'sports_club'

// The fixed, per-entity-type allow-list of "editable content fields" —
// internal workflow columns (status, pipelineReviewedAt, timestamps, ids)
// are deliberately excluded, so a member-visible diff can never leak one.
// snake_case keys match this app's existing API response convention (the
// same keys serializeEvent/serializeCamp/serializeSportsClub already use,
// and each entity's own edit.ts snapshot helper produces), so a snapshot can
// be handed straight to the frontend with no remapping. Kept as a plain key
// list, not a richer per-field schema — each entity's own detail-page Body
// component already knows how to render/edit each of its own fields (see
// web/src/events/EventBody.tsx etc.), so there's no second consumer that
// would need a generic "field kind" tag; this list's only real job is
// bounding what recordEdit is allowed to see change.
export const EDITABLE_FIELDS: Record<EntityType, string[]> = {
  event: ['title', 'description', 'start_date', 'start_time', 'end_time', 'all_day', 'location_name', 'address', 'source_url', 'topic', 'image_url', 'thumbnail_url'],
  camp: [
    'title',
    'description',
    'start_date',
    'end_date',
    'start_time',
    'end_time',
    'address',
    'location_name',
    'price_per_day',
    'price_is_estimated',
    'options',
    'options_note',
    'age_min',
    'age_max',
    'spots_available',
    'booking_status',
    'booking_instructions',
    'prep_items',
    'prep_note',
    'source_url',
    'image_url',
    'thumbnail_url',
  ],
  sports_club: [
    'title',
    'description',
    'category',
    'schedule_type',
    'first_date',
    'last_date',
    'cadence_note',
    'age_min',
    'age_max',
    'price',
    'price_unit',
    'price_per_week',
    'price_note',
    'options',
    'address',
    'location_name',
    'signup_status',
    'signup_instructions',
    'source_url',
    'image_url',
    'thumbnail_url',
  ],
}

// System actors that can write history today (feedback #141's confirmed
// "ongoing pipeline only" scope) mapped to a member-friendly description —
// shown in place of a name/avatar in the history list/detail views. Any
// future 'system:...' label not listed here falls back to the raw label
// rather than erroring, so a new system actor is never silently invisible.
const SYSTEM_ACTOR_DESCRIPTIONS: Record<string, string> = {
  'system:image-enrichment': 'Automatic photo update',
}

export function describeSystemActor(label: string): string {
  return SYSTEM_ACTOR_DESCRIPTIONS[label] ?? label
}

type Snapshot = Record<string, unknown>

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // JSON round-trip handles the array/object fields (option_list/prep_list,
  // plus the odd null-vs-undefined coming back from a partial snapshot) —
  // these lists are always small, so this is cheap.
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function diffFields(entityType: EntityType, before: Snapshot, after: Snapshot): string[] {
  return EDITABLE_FIELDS[entityType].filter((key) => !shallowEqual(before[key], after[key]))
}

// Records one edit, restricted to the entity's own EDITABLE_FIELDS —
// no-ops (no insert at all) when nothing in that allow-list actually
// changed, since a PATCH is often submitted with unchanged values and an
// automatic image re-search can legitimately re-find the same photo; an
// empty history entry would just be noise. Exactly one of actorUserId/
// actorLabel should be set — actorUserId for a real member action,
// actorLabel (a 'system:...' string) for an unattended pipeline step.
export async function recordEdit({
  entityType,
  entityId,
  actorUserId = null,
  actorLabel = null,
  before,
  after,
}: {
  entityType: EntityType
  entityId: string
  actorUserId?: string | null
  actorLabel?: string | null
  before: Snapshot
  after: Snapshot
}): Promise<void> {
  const changedFields = diffFields(entityType, before, after)
  if (changedFields.length === 0) return

  await db.insert(entityEdits).values({
    entityType,
    entityId,
    actorUserId,
    actorLabel,
    before,
    after,
    changedFields,
  })
}

interface EditHistoryActor {
  type: 'member' | 'system'
  name: string
  avatar_url: string | null
  description: string | null
}

export interface EditHistoryListItem {
  id: string
  actor: EditHistoryActor
  created_at: Date
  changed_fields: string[]
}

function resolveActor(row: { actorUserId: string | null; actorLabel: string | null; actorName: string | null; actorAvatarUrl: string | null }): EditHistoryActor {
  if (row.actorUserId && row.actorName) {
    return { type: 'member', name: row.actorName, avatar_url: row.actorAvatarUrl, description: null }
  }
  const label = row.actorLabel ?? 'system:unknown'
  return { type: 'system', name: describeSystemActor(label), avatar_url: null, description: label }
}

// Newest-first — the list a "History" page shows for one listing. No
// pagination yet (a listing's real edit count is small); revisit if that
// stops being true.
export async function listEditHistory(entityType: EntityType, entityId: string): Promise<EditHistoryListItem[]> {
  const rows = await db
    .select({
      id: entityEdits.id,
      actorUserId: entityEdits.actorUserId,
      actorLabel: entityEdits.actorLabel,
      actorName: users.name,
      actorAvatarUrl: users.avatarUrl,
      createdAt: entityEdits.createdAt,
      changedFields: entityEdits.changedFields,
    })
    .from(entityEdits)
    .leftJoin(users, eq(users.id, entityEdits.actorUserId))
    .where(and(eq(entityEdits.entityType, entityType), eq(entityEdits.entityId, entityId)))
    .orderBy(desc(entityEdits.createdAt))

  return rows.map((r) => ({
    id: r.id,
    actor: resolveActor(r),
    created_at: r.createdAt,
    changed_fields: r.changedFields as string[],
  }))
}

export interface EditHistoryDetail extends EditHistoryListItem {
  before: Snapshot
  after: Snapshot
}

export async function getEditHistoryEntry(id: string): Promise<EditHistoryDetail | null> {
  const [row] = await db
    .select({
      id: entityEdits.id,
      entityType: entityEdits.entityType,
      entityId: entityEdits.entityId,
      actorUserId: entityEdits.actorUserId,
      actorLabel: entityEdits.actorLabel,
      actorName: users.name,
      actorAvatarUrl: users.avatarUrl,
      createdAt: entityEdits.createdAt,
      changedFields: entityEdits.changedFields,
      before: entityEdits.before,
      after: entityEdits.after,
    })
    .from(entityEdits)
    .leftJoin(users, eq(users.id, entityEdits.actorUserId))
    .where(eq(entityEdits.id, id))
    .limit(1)
  if (!row) return null

  return {
    id: row.id,
    actor: resolveActor(row),
    created_at: row.createdAt,
    changed_fields: row.changedFields as string[],
    before: row.before as Snapshot,
    after: row.after as Snapshot,
  }
}

// Restore (routes.ts's POST /edit-history/:id/restore) needs the raw
// entity_type/entity_id + after snapshot to know which applyXEdit to call —
// getEditHistoryEntry's own return shape deliberately omits them, since no
// other caller needs them once it already knows which listing it's on.
export async function getRawEditHistoryEntry(id: string) {
  const [row] = await db.select().from(entityEdits).where(eq(entityEdits.id, id)).limit(1)
  return row ?? null
}
