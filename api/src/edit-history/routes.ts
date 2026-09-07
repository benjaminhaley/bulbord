// Feedback #141 (2026-09-07): the HTTP surface for the shared edit-history
// mechanism — see service.ts for the generic list/get/record logic. This
// routes file is the one place that legitimately knows about all three
// entity types' own applyXEdit functions (routing/dispatch is exactly the
// layer where that cross-feature knowledge belongs; the entities' own
// routes.ts/edit.ts files never import each other).
import type { FastifyInstance } from 'fastify'

import { requireAuth } from '../auth/plugin.js'
import { applyEventEdit, type EventEditableFields } from '../events/edit.js'
import { applyCampEdit, type CampEditableFields } from '../camps/edit.js'
import { applySportsClubEdit, type SportsClubEditableFields } from '../sports-clubs/edit.js'
import { getEditHistoryEntry, getRawEditHistoryEntry, listEditHistory, type EntityType } from './service.js'

const VALID_ENTITY_TYPES: EntityType[] = ['event', 'camp', 'sports_club']

function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (VALID_ENTITY_TYPES as string[]).includes(value)
}

export async function editHistoryRoutes(app: FastifyInstance) {
  // Viewable by any logged-in member, not gated on can_edit — the whole
  // point of a visible history is transparency now that anyone can edit
  // anything (feedback #141), so restricting who can *look* would undercut
  // that.
  app.get('/edit-history', { preHandler: requireAuth }, async (request, reply) => {
    const { entity_type: entityType, entity_id: entityId } = request.query as { entity_type?: string; entity_id?: string }
    if (!isEntityType(entityType) || !entityId) {
      return reply.code(400).send({ error: { message: 'entity_type and entity_id are required' } })
    }
    const items = await listEditHistory(entityType, entityId)
    return reply.send({ data: items })
  })

  app.get('/edit-history/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const entry = await getEditHistoryEntry(id)
    if (!entry) {
      return reply.code(404).send({ error: { message: 'History entry not found' } })
    }
    return reply.send({ data: entry })
  })

  // Restore never rewrites history — it applies the old entry's `after`
  // snapshot through the exact same write path (applyXEdit) an ordinary
  // edit uses, which itself records a brand-new forward entry (before = the
  // current live state, after = the restored values) via recordEdit. The
  // full timeline stays intact and inspectable either way.
  app.post('/edit-history/:id/restore', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const currentUser = request.currentUser!

    const raw = await getRawEditHistoryEntry(id)
    if (!raw) {
      return reply.code(404).send({ error: { message: 'History entry not found' } })
    }

    const after = raw.after as Record<string, unknown>
    let error: 'not_found' | null = null
    if (raw.entityType === 'event') {
      error = await applyEventEdit(raw.entityId, after as unknown as EventEditableFields, currentUser.id)
    } else if (raw.entityType === 'camp') {
      error = await applyCampEdit(raw.entityId, after as unknown as CampEditableFields, currentUser.id)
    } else if (raw.entityType === 'sports_club') {
      error = await applySportsClubEdit(raw.entityId, after as unknown as SportsClubEditableFields, currentUser.id)
    }

    if (error) {
      return reply.code(404).send({ error: { message: 'The listing this history entry belongs to no longer exists' } })
    }
    return reply.send({ data: { restored: true, entity_type: raw.entityType, entity_id: raw.entityId } })
  })
}
