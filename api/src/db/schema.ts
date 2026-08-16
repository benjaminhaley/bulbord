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
  // NOT NULL (feedback, 2026-08-14, after a real event shipped with none —
  // see CLAUDE.md's Images & object storage section): every insert path
  // must supply either a real found image or a generated placeholder
  // (uploads/placeholder.ts) — there is no code path that can leave this
  // null. Reverses the 2026-07-31 decision that left it nullable.
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  submittedByUserId: uuid('submitted_by_user_id'),
  approvedByUserId: uuid('approved_by_user_id'),
  // Optional subject category (feedback #97, 2026-08-16) — lets the Events
  // tab be filtered down (e.g. skip Movie Night listings that run too late).
  // Plain text like every other status column, not a DB enum; validated
  // against a fixed picker list at the application layer only (see
  // web/src/events/format.ts's TOPIC_OPTIONS). Null means unset — an older
  // or unclassified event, shown as untagged rather than defaulted to
  // "Other" (a real "nobody's looked at this yet" state, distinct from a
  // deliberate "Other" choice).
  topic: text('topic'),
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
  // Collected at signup (feedback #49) so the community's makeup is visible
  // to admin — 'staff' | 'family' | 'other'. New signups only (confirmed with
  // Ben, 2026-08-05); existing accounts stay null unless backfilled by a
  // one-off script, same posture as email's rollout.
  role: text('role'),
  // Free-text detail, only meaningful when role is 'other'.
  roleOther: text('role_other'),
  // Null until the post-profile-setup "choose friends" onboarding step
  // completes (feedback #83, see connections/) — same "real DB flag, not a
  // local preference" shape as profileCompletedAt above, so the step doesn't
  // repeat across devices and JoinGate can gate on it the same way.
  friendsStepCompletedAt: timestamp('friends_step_completed_at', { withTimezone: true }),
  // True for an operational account that isn't a real community member —
  // today, just the dedicated Apple App Review account (feedback #61, see
  // auth/update-2026-08-12-create-reviewer-account.ts). A real DB flag
  // rather than matching on email/name, so any future operational account
  // (a load-testing account, another platform-review account) gets the
  // same treatment without another code change. Excluded from every
  // member-facing "who might be your friend" surface (connections/
  // service.ts's suggestions/search) — feedback, 2026-08-14, after it
  // showed up as a friend suggestion in the sign-up flow preview. Still
  // visible in the admin /admin/users list, which is meant to show every
  // account that exists, not just real members.
  isServiceAccount: boolean('is_service_account').notNull().default(false),
  // Null until the member has opened the Friends page (or dismissed the
  // in-app notification banner) since their last new incoming connection —
  // feedback #94's "see new friends as a red icon when you open the app",
  // same "real timestamp gates a UI reveal" shape as profileCompletedAt.
  // Compared against userConnections.createdAt to compute an unseen count;
  // coalesced to this user's own createdAt when null (a brand-new account
  // has no prior connections to have missed).
  friendsSeenAt: timestamp('friends_seen_at', { withTimezone: true }),
  // Null until the member has opened the Feedback tab since a reply landed
  // on a feedback post they authored (feedback #98) — same "real timestamp
  // gates a UI reveal" shape as friendsSeenAt above, compared against
  // feedbackComments.createdAt to compute an unseen-reply count. Coalesced
  // to this user's own createdAt when null.
  feedbackRepliesSeenAt: timestamp('feedback_replies_seen_at', { withTimezone: true }),
  ...timestamps,
})

// One row per kid belonging to a Family-role member — grade only, no name/DOB
// (feedback #81). Collected as a required onboarding step when role='family'
// so the friend-suggestion algorithm (connections/) can match members with a
// kid in the same grade without storing more PII than that match needs.
// Restricted like other kid data (see CLAUDE.md Data safety & classification)
// — never exposed to other members directly, only used server-side as a
// suggestion-matching key.
export const userChildren = pgTable('user_children', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  grade: text('grade').notNull(), // 'pre-k' | 'k' | '1' .. '8'
  ...timestamps,
})

// One-directional "I added you" edge (feedback #83) — mirrors event_interests'
// toggle-via-deletedAt shape (single reusable row per pair) rather than a
// request/accept flow: adding is instant and needs no approval from the
// other side. A mutual pair (A->B and B->A both present) is what the Friends
// page renders as "Friends"; one-directional is "Following" (from the
// adder's view) or "Added you" (from the other side, prompting an "add
// back"). The recipient is alerted via email (connections/mailer usage,
// reusing newsletter/mailer.ts's generic sendEmail) since there's no
// in-app-notification-inbox system to surface it otherwise.
export const userConnections = pgTable(
  'user_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id), // the one who added
    connectedUserId: uuid('connected_user_id')
      .notNull()
      .references(() => users.id), // the one added
    // False when this edge was created to complete an already-initiated
    // mutual pair (the reverse edge already existed) — mirrors
    // addConnection()'s own "reciprocal completion is silent" check for the
    // alert email (feedback, 2026-08-14), reused here so the in-app unseen
    // count (feedback #94) doesn't flag something the recipient already
    // knew about. Set once at creation time rather than re-derived later.
    notify: boolean('notify').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_connections_user_id_connected_user_id_idx').on(table.userId, table.connectedUserId)],
)

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
  completedByUserId: uuid('completed_by_user_id').references(() => users.id),
  // A deliberately-deferred item — distinct from completedAt (which means
  // "done"). Mutually exclusive with being in the default Open view; an
  // admin can move an item to/from backlog independent of completion
  // (feedback #52).
  backloggedAt: timestamp('backlogged_at', { withTimezone: true }),
  // A fourth state alongside open/backlogged/completed (feedback #79) — for
  // an item Claude has already picked up but that's blocked on something
  // only Ben can do (pasting a DNS record, clicking through an App Store
  // Connect screen, etc.), so it doesn't get lost in the open list waiting
  // on him specifically. Mutually exclusive with backloggedAt at the route
  // level (api/src/feedback/routes.ts's setInProgress/setBacklogged each
  // clear the other) — same "one active state at a time" shape backloggedAt
  // already established relative to completedAt.
  inProgressAt: timestamp('in_progress_at', { withTimezone: true }),
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

// A reply thread on a feedback post (feedback #98, 2026-08-16) — same shape
// as eventComments/campComments above. Replaces the old single admin-only
// completionNote field: any member (not just admin) can reply, and the
// feedback author gets an in-app-only notification (no email, no banner —
// see users.feedbackRepliesSeenAt above) when someone other than themselves
// replies. Existing completionNote text was backfilled into this table as
// each item's first comment before the column was dropped (see
// api/src/feedback/backfill-2026-08-16-notes-to-comments.ts).
export const feedbackComments = pgTable('feedback_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackId: uuid('feedback_id')
    .notNull()
    .references(() => feedback.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
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

// One row of the camp detail page's "Options" section — a real bookable
// tier (full day, half-day, a discount). `label` is always rendered bold.
// Originally label+detail with `detail` a hand-formatted string encoding
// time/price/age together (e.g. "9:00 AM – 1:00 PM · $65/day · Ages
// 5-13") — after a full day of formatting corrections to that hand-typed
// convention (inconsistent bold treatment, mixed separators, a missing
// colon that silently broke bolding entirely), promoted to real per-field
// structure 2026-08-05 (feedback: "every option should include an age
// range, a time, and a price... consistent structured fields for each
// option") specifically so the detail page can render every tier as an
// aligned, scannable table (see CampDetailPage.tsx's OptionsTable) instead
// of parsing a flat string. start_time/end_time/price/age_min/age_max are
// each independently nullable — not every option has a fixed clock time (a
// flexible drop-in pass) or a per-tier age override (most tiers just share
// the camp's own age_min/age_max) — a table cell shows "—" for a null
// field rather than fabricating one. `note` is the deliberate escape hatch
// for anything that doesn't fit those columns (a weekly rate, a sibling
// discount, a duration for a pass with no fixed clock time) — a
// label+note-only row with every other field null is a normal, expected
// shape, not a degraded case. snake_case field names (unlike the rest of
// this file's camelCase columns) because this object is stored/returned as
// one raw JSONB blob with no per-field mapping in routes.ts — matches the
// snake_case convention every top-level API field already uses. Stored as
// JSONB directly on the row rather than a child table — this list is never
// queried independently of its camp, so a real relational table would add
// join complexity (especially to the by-break bulk fetch) without a real
// query need driving it.
export interface CampOptionLine {
  label: string
  start_time: string | null
  end_time: string | null
  price: string | null
  age_min: number | null
  age_max: number | null
  note: string | null
}

// One line of the "What to bring / prepare" section — deliberately kept at
// this simpler label+detail shape (unlike CampOptionLine above), since a
// packing-list item genuinely has no time/age/price to decompose into; only
// `options`' bookable tiers needed that structure.
export interface CampPrepLine {
  label: string
  detail: string
}

export const camps = pgTable('camps', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  // Camps are date ranges, not single dates like events — endDate is NOT
  // NULL because the application layer defaults it to startDate on write
  // when omitted (a single-day camp), so every downstream date-range
  // comparison (school-break overlap grouping) never needs to coalesce a
  // null.
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  // Time-of-day the camp actually runs (feedback, 2026-08-05: exact hours
  // matter more than the description and must be shown up front) — reverses
  // the original "camps aren't scheduled to the hour" call above. Nullable:
  // a provider whose real hours can't be confirmed (e.g. a flexible drop-in
  // pass with no fixed start/end, or a source with no public schedule) stays
  // null and shows "Time: not specified" (camps/format.ts's timeLabel)
  // rather than a fabricated time, same honesty posture as every other
  // optional camp field.
  startTime: time('start_time'),
  endTime: time('end_time'),
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
  // Structured breakdown for a provider with tiered/add-on pricing (e.g.
  // [{label: "Day camp", detail: "8:00 AM – 3:00 PM · $85/day"}, ...]) — see
  // CampOptionLine above. pricePerDay/priceLabel always shows one single
  // full-day number for the compact list/preview line (feedback,
  // 2026-08-05); this is the expanded detail shown only on the camp detail
  // page's "Options" section, never in the compact line. Null/empty for a
  // camp with no real tiered structure to show (including every
  // member-submitted camp — see optionsNote below).
  options: jsonb('options').$type<CampOptionLine[]>(),
  // A short free-text aside shown under the Options table (or, for a
  // member-submitted camp, in place of it — see CampForm.tsx's "keep it
  // simple" posture, feedback 2026-08-05). Two roles: (1) a hand-seeded
  // provider's asides that genuinely don't belong as their own bookable
  // table row — a sibling discount, a weekly rate — moved here from the
  // `options` array itself (feedback, 2026-08-05: "don't include it in the
  // list of options table... there should be some sort of notes field at
  // the bottom"); (2) the member self-service equivalent of the whole
  // `options` table when a member has no real tiers to structure.
  optionsNote: text('options_note'),
  ageMin: integer('age_min'), // years
  ageMax: integer('age_max'), // years
  // Real-time availability isn't tracked (no live booking integration) — null
  // means unknown, not zero. Always surfaced in the UI as "Unknown" rather
  // than hidden, same posture as price_is_estimated (never silently omitted).
  spotsAvailable: integer('spots_available'),
  // When/how to register (e.g. "Register online at ymcachicago.org...") —
  // free text, same "always shown, even if null" posture as the other
  // optional fields above (see camps/format.ts). Not structured — phrasing
  // varies too much per provider and pairs with the already-structured
  // sourceUrl "View Booking Page" button, so there's no repeating shape here
  // worth extracting the way there was for options/prepItems.
  bookingInstructions: text('booking_instructions'),
  // Whether the camp's registration is actually open right now (feedback
  // #68, 2026-08-13) — 'open' | 'full' | 'waitlist' | 'not_opened'. Distinct
  // from bookingInstructions above: that's static "how to register" text,
  // this is the live-ish state of the real registration system, checked
  // per camp/date the same way price/hours/dates were (see the Data
  // sourcing quality checklist in CLAUDE.md — never trust a stated blanket
  // policy, check the real system). Null means genuinely unresearched or
  // unconfirmable (a JS-rendered booking widget this codebase couldn't
  // query) — shown as "Booking: Unknown" (camps/format.ts's
  // bookingStatusLabel), same "always shown, even if unknown" posture as
  // every other optional camp field, never silently omitted. A snapshot
  // like every other hand-researched camp field, not live-polled — expect
  // it to go stale and be refreshed only when asked, same as price/dates.
  // Seed-only for now, like priceIsEstimated/options — not on the member
  // self-service POST/PATCH body (see routes.ts).
  bookingStatus: text('booking_status'),
  // Structured "what to bring / prepare" checklist — see CampPrepLine above.
  prepItems: jsonb('prep_items').$type<CampPrepLine[]>(),
  // Member-submitted-camp equivalent of optionsNote above, for the same
  // "keep it simple" reason — a single free-text aside, not a structured list.
  prepNote: text('prep_note'),
  sourceUrl: text('source_url'),
  sourceId: uuid('source_id').references(() => campSources.id),
  // NOT NULL — see the identical note on events.imageUrl above.
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
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
