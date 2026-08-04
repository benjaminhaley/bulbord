import { sql } from 'drizzle-orm'
import { boolean, date, integer, jsonb, numeric, pgTable, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

export const eventSources = pgTable('event_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull(), // 'generic_search' | 'website' | 'facebook_group' | ...
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  notes: text('notes'),
  ...timestamps,
})

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: date('start_date').notNull(),
  startTime: time('start_time'), // null = no specific time
  allDay: boolean('all_day').notNull().default(false),
  address: text('address'),
  // A human-friendly place name ("Merlo Library") shown in place of the raw
  // address on the events list; opportunistically populated during sourcing
  // (JSON-LD location.name, or filled in by hand), same as latitude/longitude
  // above — not a live lookup. Falls back to the raw address when absent.
  locationName: text('location_name'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  sourceUrl: text('source_url'),
  sourceId: uuid('source_id').references(() => eventSources.id),
  imageUrl: text('image_url'),
  thumbnailUrl: text('thumbnail_url'),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  submittedByUserId: uuid('submitted_by_user_id'),
  approvedByUserId: uuid('approved_by_user_id'),
  ...timestamps,
})

// One row per (user, event) ever swiped, toggled via deletedAt rather than
// inserted/deleted per swipe — keeps a single unique row per pair while
// still following the soft-delete-only rule. `status` records which way the
// user swiped; a missing or soft-deleted row means "no action taken yet".
export const eventInterests = pgTable(
  'event_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    status: text('status').notNull(), // 'interested' | 'dismissed'
    ...timestamps,
  },
  (table) => [uniqueIndex('event_interests_user_event_idx').on(table.userId, table.eventId)],
)

export const eventComments = pgTable('event_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  ...timestamps,
})

export const eventsLog = pgTable('events_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  // Whether this user should receive the weekly events newsletter (see
  // api/src/newsletter/). Defaults on; flipped off via the no-login-required
  // unsubscribe link, never re-enabled automatically.
  newsletterSubscribed: boolean('newsletter_subscribed').notNull().default(true),
  // Null means system/root (no inviter) — the very first account, created via
  // the ROOT_INVITE_SECRET bootstrap. Every other user was invited by scanning
  // another member's share QR (see web/src/sharing/ShareButton.tsx), which
  // carries `?invite=<inviter's user id>`.
  invitedByUserId: uuid('invited_by_user_id'),
  // Null until the post-registration "set up your profile" step (real
  // name + optional photo) completes — the frontend join gate uses this,
  // not a placeholder-name string match, to decide whether to show that step.
  profileCompletedAt: timestamp('profile_completed_at', { withTimezone: true }),
  ...timestamps,
})

// One row per passkey (WebAuthn credential) a user has registered. A user can
// have more than one (e.g. one per device) — deletedAt revokes a lost device's
// passkey without touching the others.
export const passkeyCredentials = pgTable(
  'passkey_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    credentialId: text('credential_id').notNull(), // base64url, from the authenticator
    publicKey: text('public_key').notNull(), // base64url-encoded COSE public key
    counter: integer('counter').notNull().default(0), // signature counter, for clone detection
    deviceType: text('device_type').notNull(), // 'singleDevice' | 'multiDevice'
    backedUp: boolean('backed_up').notNull(),
    transports: jsonb('transports'), // e.g. ['internal', 'hybrid']
    ...timestamps,
  },
  (table) => [uniqueIndex('passkey_credentials_credential_id_idx').on(table.credentialId)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps, // deletedAt doubles as "revoked at" (logout)
  },
  (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)],
)

// Roles are data, not hardcoded checks, so approval/admin duties can be
// reassigned or delegated (e.g. to Claude) later without a schema change.
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: text('role').notNull(), // 'admin' | 'approver' | ...
  ...timestamps, // deletedAt doubles as "role revoked at"
})

// Running list of feature requests/notes. Only Ben posts today, but any
// logged-in user can (see api/src/feedback/routes.ts) so opening it up to
// others later needs no schema change.
export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  // A small, subtle, permanent reference number ("#28") assigned in creation
  // order across all feedback ever posted (open and closed) — backed by a DB
  // sequence (feedback_number_seq) so it's never reused even if a row is later
  // soft-deleted. Not the primary key on purpose: the UUID stays the real
  // identity, this is just a human-friendly way to refer to one in conversation.
  number: integer('number')
    .notNull()
    .unique()
    .default(sql`nextval('feedback_number_seq')`),
  title: text('title').notNull(),
  description: text('description'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completionNote: text('completion_note'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id),
  ...timestamps,
})

// One row per photo attached to a feedback post — a post can now carry more
// than one (feedback #40). `position` preserves attach order since multiple
// rows inserted in one statement don't reliably tie-break on createdAt alone.
export const feedbackImages = pgTable('feedback_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id')
    .notNull()
    .references(() => feedback.id),
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  position: integer('position').notNull().default(0),
  ...timestamps,
})

// Camps (feedback #50) is a deliberately fresh, non-shared clone of the
// events tables above — camps and events are expected to diverge over time,
// so this is its own set of tables rather than a reuse of events/eventSources.
export const campSources = pgTable('camp_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull(), // 'provider_website' today
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  notes: text('notes'),
  ...timestamps,
})

export const camps = pgTable('camps', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  // Camps are date ranges, not single dates like events — endDate is NOT
  // NULL because the application layer defaults it to startDate on write
  // when omitted (a single-day camp), so every downstream date-range
  // comparison (school-break overlap grouping) never needs to coalesce a
  // null. No time-of-day fields (startTime/allDay) — camps aren't scheduled
  // to the hour the way events are.
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  address: text('address'),
  locationName: text('location_name'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  // Straight-line miles from Nettelhorst (see camps/geo.ts), populated
  // opportunistically whenever latitude/longitude are known — same posture
  // as latitude/longitude themselves, not a live lookup.
  distanceMiles: numeric('distance_miles', { precision: 5, scale: 2 }),
  pricePerDay: numeric('price_per_day', { precision: 6, scale: 2 }),
  // True when pricePerDay was inferred from a provider's stated recurring
  // policy (e.g. "we run camp on every CPS non-attendance day, $X/day")
  // applied to a specific future break date, rather than an individually
  // published listing for that date — surfaced to users (see camps/format.ts
  // priceLabel) so an inferred price is never shown as if it were confirmed.
  // A later pass should revisit these and replace inferred prices with
  // actual published ones as they become available.
  priceIsEstimated: boolean('price_is_estimated').notNull().default(false),
  ageMin: integer('age_min'), // years
  ageMax: integer('age_max'), // years
  // Real-time availability isn't tracked (no live booking integration) — null
  // means unknown, not zero. Always surfaced in the UI as "Unknown" rather
  // than hidden, same posture as price_is_estimated (never silently omitted).
  spotsAvailable: integer('spots_available'),
  // When/how to register (e.g. "Register online at ymcachicago.org...") and
  // what to bring/prepare beforehand (packing list, permission slips, forms)
  // — free text, same "always shown, even if null" posture as the other
  // optional fields above (see camps/format.ts).
  bookingInstructions: text('booking_instructions'),
  prepInstructions: text('prep_instructions'),
  sourceUrl: text('source_url'),
  sourceId: uuid('source_id').references(() => campSources.id),
  imageUrl: text('image_url'),
  thumbnailUrl: text('thumbnail_url'),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  submittedByUserId: uuid('submitted_by_user_id'),
  approvedByUserId: uuid('approved_by_user_id'),
  ...timestamps,
})

// One row per (user, camp) ever swiped, toggled via deletedAt — same shape
// as eventInterests above.
export const campInterests = pgTable(
  'camp_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    campId: uuid('camp_id')
      .notNull()
      .references(() => camps.id),
    status: text('status').notNull(), // 'interested' | 'dismissed'
    ...timestamps,
  },
  (table) => [uniqueIndex('camp_interests_user_camp_idx').on(table.userId, table.campId)],
)

export const campComments = pgTable('camp_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  campId: uuid('camp_id')
    .notNull()
    .references(() => camps.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  ...timestamps,
})

// Nettelhorst/CPS school-break calendar, driving the Camps tab's
// accordion-by-break browse view. No events equivalent.
export const schoolBreaks = pgTable('school_breaks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(), // "Thanksgiving Break", "Winter Break", "Spring Break", "Summer Break"
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  // True only for Summer Break today — tells the by-break grouping to split
  // this break into weekly buckets for browsing instead of one section,
  // since camps run week-by-week over the summer.
  splitWeekly: boolean('split_weekly').notNull().default(false),
  notes: text('notes'), // source citation, same convention as eventSources.notes
  ...timestamps,
})
