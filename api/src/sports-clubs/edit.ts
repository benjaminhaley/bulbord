// Feedback #141 (2026-09-07): the one shared write path for "change an
// existing sports club's editable content fields" — used by both PATCH
// /sports-clubs/:id and the edit-history restore endpoint. Mirrors
// events/edit.ts and camps/edit.ts's shape (a deliberately fresh,
// non-shared clone — see CLAUDE.md) rather than importing either.
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { sportsClubs, type SportsClubOptionLine } from '../db/schema.js'
import { recordEdit } from '../edit-history/service.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'

export interface SportsClubEditableFields {
  title: string
  description: string | null
  category: string
  schedule_type: string
  first_date: string | null
  last_date: string | null
  cadence_note: string | null
  age_min: number | null
  age_max: number | null
  price: number | null
  price_unit: string | null
  // Feedback #141 opened these two up from seed-only to member-editable —
  // same reasoning as camps/edit.ts's identical comment on its own newly-
  // opened fields.
  price_per_week: number | null
  price_note: string | null
  options: SportsClubOptionLine[] | null
  address: string
  location_name: string | null
  signup_status: string | null
  signup_instructions: string | null
  source_url: string | null
  image_url: string | null
  thumbnail_url: string | null
}

type SportsClubSnapshotRow = Pick<
  typeof sportsClubs.$inferSelect,
  | 'title'
  | 'description'
  | 'category'
  | 'scheduleType'
  | 'firstDate'
  | 'lastDate'
  | 'cadenceNote'
  | 'ageMin'
  | 'ageMax'
  | 'price'
  | 'priceUnit'
  | 'pricePerWeek'
  | 'priceNote'
  | 'options'
  | 'address'
  | 'locationName'
  | 'signupStatus'
  | 'signupInstructions'
  | 'sourceUrl'
  | 'imageUrl'
  | 'thumbnailUrl'
>

// snake_case, matching this app's API response convention (and
// edit-history/service.ts's EDITABLE_FIELDS.sports_club keys).
function snapshotSportsClubForHistory(c: SportsClubSnapshotRow): Record<string, unknown> {
  return {
    title: c.title,
    description: c.description,
    category: c.category,
    schedule_type: c.scheduleType,
    first_date: c.firstDate,
    last_date: c.lastDate,
    cadence_note: c.cadenceNote,
    age_min: c.ageMin,
    age_max: c.ageMax,
    price: c.price,
    price_unit: c.priceUnit,
    price_per_week: c.pricePerWeek,
    price_note: c.priceNote,
    options: c.options,
    address: c.address,
    location_name: c.locationName,
    signup_status: c.signupStatus,
    signup_instructions: c.signupInstructions,
    source_url: c.sourceUrl,
    image_url: c.imageUrl,
    thumbnail_url: c.thumbnailUrl,
  }
}

export type ApplySportsClubEditError = 'not_found'

export async function applySportsClubEdit(
  sportsClubId: string,
  fields: SportsClubEditableFields,
  actorUserId: string,
): Promise<ApplySportsClubEditError | null> {
  const [existing] = await db
    .select({
      title: sportsClubs.title,
      description: sportsClubs.description,
      category: sportsClubs.category,
      scheduleType: sportsClubs.scheduleType,
      firstDate: sportsClubs.firstDate,
      lastDate: sportsClubs.lastDate,
      cadenceNote: sportsClubs.cadenceNote,
      ageMin: sportsClubs.ageMin,
      ageMax: sportsClubs.ageMax,
      price: sportsClubs.price,
      priceUnit: sportsClubs.priceUnit,
      pricePerWeek: sportsClubs.pricePerWeek,
      priceNote: sportsClubs.priceNote,
      options: sportsClubs.options,
      address: sportsClubs.address,
      locationName: sportsClubs.locationName,
      signupStatus: sportsClubs.signupStatus,
      signupInstructions: sportsClubs.signupInstructions,
      sourceUrl: sportsClubs.sourceUrl,
      imageUrl: sportsClubs.imageUrl,
      thumbnailUrl: sportsClubs.thumbnailUrl,
    })
    .from(sportsClubs)
    .where(and(eq(sportsClubs.id, sportsClubId), isNull(sportsClubs.deletedAt)))
    .limit(1)
  if (!existing) return 'not_found'

  const image =
    fields.image_url && fields.thumbnail_url
      ? { imageUrl: fields.image_url, thumbnailUrl: fields.thumbnail_url }
      : await uploadPlaceholderImage(fields.title, 'sportsclubs')

  const written: SportsClubSnapshotRow = {
    title: fields.title,
    description: fields.description,
    category: fields.category,
    scheduleType: fields.schedule_type === 'ongoing' ? 'ongoing' : 'fixed_session',
    firstDate: fields.first_date,
    lastDate: fields.last_date,
    cadenceNote: fields.cadence_note,
    ageMin: fields.age_min,
    ageMax: fields.age_max,
    price: fields.price != null ? String(fields.price) : null,
    priceUnit: fields.price_unit,
    pricePerWeek: fields.price_per_week != null ? String(fields.price_per_week) : null,
    priceNote: fields.price_note,
    options: fields.options,
    address: fields.address,
    locationName: fields.location_name,
    signupStatus: fields.signup_status,
    signupInstructions: fields.signup_instructions,
    sourceUrl: fields.source_url,
    imageUrl: image.imageUrl,
    thumbnailUrl: image.thumbnailUrl,
  }

  await db.update(sportsClubs).set({ ...written, updatedAt: new Date() }).where(eq(sportsClubs.id, sportsClubId))

  await recordEdit({
    entityType: 'sports_club',
    entityId: sportsClubId,
    actorUserId,
    before: snapshotSportsClubForHistory(existing),
    after: snapshotSportsClubForHistory(written),
  })

  return null
}
