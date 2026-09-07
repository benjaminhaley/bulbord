// Feedback #141 (2026-09-07): the one shared write path for "change an
// existing camp's editable content fields" — used by both PATCH /camps/:id
// and the edit-history restore endpoint. Mirrors events/edit.ts's shape
// (camps is a deliberately fresh, non-shared clone — see CLAUDE.md feedback
// #50) rather than importing it.
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { camps, type CampOptionLine, type CampPrepLine } from '../db/schema.js'
import { recordEdit } from '../edit-history/service.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

export interface CampEditableFields {
  title: string
  description: string | null
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  address: string
  location_name: string | null
  price_per_day: number | null
  // Feedback #141 opened these four up from seed-only to member-editable —
  // see CLAUDE.md's "Structured Options/What-to-bring" and Pricing honesty
  // bullets for why they started that way (a member always knew their own
  // listing's real price, but couldn't know a provider's genuine tiered
  // structure) — now that any member can correct any listing (not just
  // their own), that original reasoning no longer excludes them.
  price_is_estimated: boolean
  options: CampOptionLine[] | null
  options_note: string | null
  age_min: number | null
  age_max: number | null
  spots_available: number | null
  booking_status: string | null
  booking_instructions: string | null
  prep_items: CampPrepLine[] | null
  prep_note: string | null
  source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
}

type CampSnapshotRow = Pick<
  typeof camps.$inferSelect,
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'address'
  | 'locationName'
  | 'pricePerDay'
  | 'priceIsEstimated'
  | 'options'
  | 'optionsNote'
  | 'ageMin'
  | 'ageMax'
  | 'spotsAvailable'
  | 'bookingStatus'
  | 'bookingInstructions'
  | 'prepItems'
  | 'prepNote'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
>

// snake_case, matching this app's API response convention (and
// edit-history/service.ts's EDITABLE_FIELDS.camp keys) — so a snapshot can
// be handed to the frontend with no remapping.
function snapshotCampForHistory(c: CampSnapshotRow): Record<string, unknown> {
  return {
    title: c.title,
    description: c.description,
    start_date: c.startDate,
    end_date: c.endDate,
    start_time: c.startTime,
    end_time: c.endTime,
    address: c.address,
    location_name: c.locationName,
    price_per_day: c.pricePerDay,
    price_is_estimated: c.priceIsEstimated,
    options: c.options,
    options_note: c.optionsNote,
    age_min: c.ageMin,
    age_max: c.ageMax,
    spots_available: c.spotsAvailable,
    booking_status: c.bookingStatus,
    booking_instructions: c.bookingInstructions,
    prep_items: c.prepItems,
    prep_note: c.prepNote,
    source_url: c.sourceUrl,
    image_url: c.imageUrl,
    thumbnail_url: c.thumbnailUrl,
  }
}

export type ApplyCampEditError = 'not_found'

export async function applyCampEdit(campId: string, fields: CampEditableFields, actorUserId: string): Promise<ApplyCampEditError | null> {
  const [existing] = await db
    .select({
      title: camps.title,
      description: camps.description,
      startDate: camps.startDate,
      endDate: camps.endDate,
      startTime: camps.startTime,
      endTime: camps.endTime,
      address: camps.address,
      locationName: camps.locationName,
      pricePerDay: camps.pricePerDay,
      priceIsEstimated: camps.priceIsEstimated,
      options: camps.options,
      optionsNote: camps.optionsNote,
      ageMin: camps.ageMin,
      ageMax: camps.ageMax,
      spotsAvailable: camps.spotsAvailable,
      bookingStatus: camps.bookingStatus,
      bookingInstructions: camps.bookingInstructions,
      prepItems: camps.prepItems,
      prepNote: camps.prepNote,
      sourceUrl: camps.sourceUrl,
      imageUrl: camps.imageUrl,
      thumbnailUrl: camps.thumbnailUrl,
    })
    .from(camps)
    .where(and(eq(camps.id, campId), isNull(camps.deletedAt)))
    .limit(1)
  if (!existing) return 'not_found'

  const image =
    fields.image_url && fields.thumbnail_url
      ? { imageUrl: fields.image_url, thumbnailUrl: fields.thumbnail_url }
      : await uploadPlaceholderImage(fields.title, 'camps')

  const written: CampSnapshotRow = {
    title: fields.title,
    description: fields.description,
    startDate: fields.start_date,
    endDate: fields.end_date,
    startTime: fields.start_time,
    endTime: fields.end_time,
    address: fields.address,
    locationName: fields.location_name,
    pricePerDay: fields.price_per_day != null ? String(fields.price_per_day) : null,
    priceIsEstimated: fields.price_is_estimated,
    options: fields.options,
    optionsNote: fields.options_note,
    ageMin: fields.age_min,
    ageMax: fields.age_max,
    spotsAvailable: fields.spots_available,
    bookingStatus: fields.booking_status,
    bookingInstructions: fields.booking_instructions,
    prepItems: fields.prep_items,
    prepNote: fields.prep_note,
    sourceUrl: fields.source_url,
    imageUrl: image.imageUrl,
    thumbnailUrl: image.thumbnailUrl,
  }

  await db.update(camps).set({ ...written, updatedAt: new Date() }).where(eq(camps.id, campId))

  await recordEdit({
    entityType: 'camp',
    entityId: campId,
    actorUserId,
    before: snapshotCampForHistory(existing),
    after: snapshotCampForHistory(written),
  })

  return null
}
