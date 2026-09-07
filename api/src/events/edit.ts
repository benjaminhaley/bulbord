// Feedback #141 (2026-09-07): the one shared write path for "change an
// existing event's editable content fields" — used by both PATCH /events/:id
// and the edit-history restore endpoint (POST /edit-history/:id/restore), so
// restoring an old version isn't a second, parallel implementation of the
// same update+placeholder-fallback+history-recording logic.
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'
import { recordEdit } from '../edit-history/service.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { enrichEventImage } from './image-enrichment.js'
import { snapshotEventForHistory } from './serialize.js'

export interface EventEditableFields {
  title: string
  description: string | null
  start_date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  location_name: string | null
  address: string
  source_url: string | null
  topic: string | null
  // Present when the caller already has a real uploaded image (a member's
  // own attach, or a restore replaying an old snapshot's exact photo) —
  // absent/null falls back to a generated placeholder, same NOT NULL
  // guarantee every other event-writing path already honors.
  image_url: string | null
  thumbnail_url: string | null
}

export type ApplyEventEditError = 'not_found'

export async function applyEventEdit(eventId: string, fields: EventEditableFields, actorUserId: string): Promise<ApplyEventEditError | null> {
  const [existing] = await db
    .select({
      title: events.title,
      description: events.description,
      startDate: events.startDate,
      startTime: events.startTime,
      endTime: events.endTime,
      allDay: events.allDay,
      locationName: events.locationName,
      address: events.address,
      sourceUrl: events.sourceUrl,
      topic: events.topic,
      imageUrl: events.imageUrl,
      thumbnailUrl: events.thumbnailUrl,
    })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
    .limit(1)
  if (!existing) return 'not_found'

  const image =
    fields.image_url && fields.thumbnail_url
      ? { imageUrl: fields.image_url, thumbnailUrl: fields.thumbnail_url }
      : await uploadPlaceholderImage(fields.title, 'events')

  const startTime = fields.all_day ? null : fields.start_time
  const endTime = fields.all_day ? null : fields.end_time

  await db
    .update(events)
    .set({
      title: fields.title,
      description: fields.description,
      startDate: fields.start_date,
      startTime,
      endTime,
      allDay: fields.all_day,
      locationName: fields.location_name,
      address: fields.address,
      sourceUrl: fields.source_url,
      topic: fields.topic,
      imageUrl: image.imageUrl,
      thumbnailUrl: image.thumbnailUrl,
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId))

  await recordEdit({
    entityType: 'event',
    entityId: eventId,
    actorUserId,
    before: snapshotEventForHistory(existing),
    after: snapshotEventForHistory({
      title: fields.title,
      description: fields.description,
      startDate: fields.start_date,
      startTime,
      endTime,
      allDay: fields.all_day,
      locationName: fields.location_name,
      address: fields.address,
      sourceUrl: fields.source_url,
      topic: fields.topic,
      imageUrl: image.imageUrl,
      thumbnailUrl: image.thumbnailUrl,
    }),
  })

  // Same fire-and-forget re-search PATCH /events/:id has always done —
  // clearing a photo (or restoring a version that never had one, e.g. a
  // pre-photo-history event) shouldn't leave the event permanently stuck on
  // a placeholder.
  if (!(fields.image_url && fields.thumbnail_url)) {
    void enrichEventImage(eventId, {
      sourceUrl: fields.source_url,
      title: fields.title,
      description: fields.description,
    }).catch(() => {})
  }

  return null
}
