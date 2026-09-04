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
  type: text('type').notNull(), // 'generic_search' | 'website' | 'facebook_group' | 'email' | ...
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  // A hash of the page's cleaned text as of the last successful extraction
  // (2026-09-03) — lets resourcing.ts skip re-running extraction entirely
  // when a source's page hasn't changed since the last check. This isn't
  // an efficiency nicety: this model doesn't support `temperature`/`top_p`
  // (confirmed via a real 400 from the API — both are "deprecated for this
  // model"), so there's no sampling-control knob to make a re-extraction
  // of unchanged content reliably produce the same output. Real, repeated
  // testing showed the same unchanged page re-extracted minutes apart
  // reliably produces near-duplicate titles for the same events — the
  // only robust fix is to not re-run extraction at all when nothing on
  // the page has changed.
  lastContentHash: text('last_content_hash'),
  notes: text('notes'),
  ...timestamps,
})

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  startDate: date('start_date').notNull(),
  startTime: time('start_time'), // null = no specific time
  // Added 2026-08-23 (feedback: a poster gave a clear "11am-3pm" range,
  // and the app had nowhere to put the end) — mirrors camps.endTime/
  // sports_clubs.endTime's existing shape exactly. Null means either no
  // specific end was given, or the event only ever had a single start time
  // to begin with — same "null = unknown/not applicable" posture as
  // startTime itself.
  endTime: time('end_time'),
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
  // Per-type email toggles for the unified notification center (feedback
  // #100, 2026-08-17) — replaces the old friendsSeenAt/feedbackRepliesSeenAt
  // "real timestamp gates a UI reveal" pair (superseded by
  // notifications.dismissedAt below, which tracks per-notification state
  // directly rather than a single "last seen" watermark per feature). Email
  // is the only toggleable channel (confirmed with Ben) — the in-app
  // notification list itself always includes every type, since it's the
  // notification inbox, not an optional channel. All default true so
  // existing members keep getting exactly the emails they already got
  // before this shipped. newsletterSubscribed above is the fourth such
  // toggle, pre-existing and unchanged.
  notifyFriendAddedEmail: boolean('notify_friend_added_email').notNull().default(true),
  notifyFeedbackReplyEmail: boolean('notify_feedback_reply_email').notNull().default(true),
  // Covers both event and camp comment-reply notifications (one setting,
  // not two — Events/Camps parity confirmed with Ben) since they're the
  // same notification concept ("someone replied to something you posted")
  // just on two different content types.
  notifyContentCommentEmail: boolean('notify_content_comment_email').notNull().default(true),
  ...timestamps,
})

// A unified in-app notification feed (feedback #100, 2026-08-17) —
// replaces the previous per-feature "unseen count derived from a
// last-seen timestamp" shape (userConnections' notify flag +
// friendsSeenAt, feedbackComments + feedbackRepliesSeenAt) with real,
// individually-dismissible rows: "click on my profile, you should be able
// to quickly see a set of notifications that... lead exactly to the
// correct place... there's a little X where you can dismiss them."
// `message`/`targetPath` are precomputed at creation time (denormalized,
// same "snapshot" posture as the existing email templates already have)
// rather than joined live from the referenced content — simpler, and a
// notification is meant to read as "what happened then," not update if the
// underlying content is edited later. One row backs both the unread badge
// count (dismissedAt is null) and the /notifications list itself.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id), // the recipient
  type: text('type').notNull(), // 'friend_added' | 'friend_request_accepted' | 'feedback_reply' | 'event_comment' | 'camp_comment' | 'sports_club_comment'
  actorUserId: uuid('actor_user_id').references(() => users.id), // who triggered it, for the avatar shown in the list
  message: text('message').notNull(),
  targetPath: text('target_path').notNull(), // e.g. '/friends', '/feedback/:id', '/events/:id', '/camps/:id'
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
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
      .references(() => users.id), // the one added / requested
    // Real friend-request semantics (feedback #127, 2026-09-03, reversing
    // the original 2026-08-14 "instant, no approval needed" design): a row
    // starts 'pending' when userId sends connectedUserId a request, and
    // only becomes 'accepted' once connectedUserId explicitly accepts it —
    // there's no second row for the reverse direction once accepted; one
    // row represents the whole relationship regardless of who initiated it.
    // A decline soft-deletes the row (deletedAt) rather than a third status
    // value, so a fresh request can be sent again later — same toggle
    // convention as every other deletedAt-toggled table in this codebase.
    // Migrated from the old instant-add data (connections/backfill-
    // 2026-09-03-request-status.ts): an existing mutual pair (both
    // directions' rows already existed) became 'accepted' on both rows'
    // sides collapsed into one; an existing one-directional edge became a
    // 'pending' request — the same shape a real request already has.
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted'
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

// A reply thread on a feedback post (feedback #98, 2026-08-16). Replaces the
// old single admin-only completionNote field: any member (not just admin)
// can reply, and the feedback author gets a notification (in-app via the
// notifications table above, plus email — see feedback/notifications.ts)
// when someone other than themselves replies. Existing completionNote text
// was backfilled into this table as each item's first comment before the
// column was dropped (see api/src/feedback/backfill-2026-08-16-notes-to-comments.ts).
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

// One row per photo attached to a reply (feedback, 2026-08-17: "image
// pasting isn't working in feedback replies. It should work the same way it
// would in the original post") — same shape as feedbackImages above,
// including a reply being able to carry more than one photo and
// `position` preserving attach order for the same reason.
export const feedbackCommentImages = pgTable('feedback_comment_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedbackCommentId: uuid('feedback_comment_id')
    .notNull()
    .references(() => feedbackComments.id),
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
  // When the "day off camp" reminder email (feedback #120) was actually sent
  // for this break — null means not yet. Set once, by
  // camp-reminders/send-due.ts, only after a real send (never for a break
  // with zero camps overlapping it — see camp-reminders/window.ts). Prevents
  // a second email for the same break on a later cron run, while still
  // letting the cron catch up automatically if a run was missed on the
  // exact due date (see the recurring-series-health.ts header above for why
  // "silently never fires again" is the failure mode this codebase has
  // learned to design against).
  remindedAt: timestamp('reminded_at', { withTimezone: true }),
  ...timestamps,
})

// Sports & Clubs (a fourth content tab, alongside Events/Camps/Feedback) is
// another deliberately fresh, non-shared clone — same rationale as Camps'
// header comment above: dance classes, park-district leagues, school clubs
// etc. are expected to diverge from both events and camps over time, so this
// is its own set of tables rather than a reuse of either.
export const sportsClubSources = pgTable('sports_club_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull(), // 'provider_website' today, mirrors campSources.type
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  notes: text('notes'),
  ...timestamps,
})

// A real bookable/attendable tier of a listing that genuinely has more than
// one — different age levels each meeting at a different time (Uniting
// Voices Chicago's Allegro/Vivace/Presto), a half-day/full-day split, etc.
// Added after the first real seed pass (2026-08-18) crammed exactly this
// kind of multi-tier fact into cadenceNote as prose ("Allegro 4:45-5:45pm,
// Vivace 5:45-6:45pm, Presto 6:45-7:45pm...") and read as a wall of text —
// same lesson Camps already learned the hard way with CampOptionLine (see
// that interface's own comment). Each field is independently nullable — a
// table cell shows "—" for a null field rather than fabricating one; `note`
// is the escape hatch for anything that doesn't fit the other columns.
// cadenceNote stays reserved for the *single*-cadence case (most listings)
// or for genuine non-schedule extras once a listing has real options — see
// web/src/sports-clubs/format.ts's OptionsTable-equivalent for how this
// renders, and web/src/sports-clubs/SportsClubDetailPage.tsx for why it
// suppresses the top summary line the same way Camps' own detail page does
// once a real options table exists.
export interface SportsClubOptionLine {
  label: string
  start_time: string | null
  end_time: string | null
  price: string | null
  price_unit: string | null
  age_min: number | null
  age_max: number | null
  note: string | null
}

export const sportsClubs = pgTable('sports_clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(), // the exact activity, e.g. "T-ball", "Chess Club", "Ballet — Beginner"
  description: text('description'),
  // Fixed app-layer picker (Dance, Sports & Athletics, Martial Arts, Music,
  // Art & Creative, Academic & Clubs, Other) — plain text like
  // events.topic/users.role, no DB enum, validated only at the application
  // layer (see web/src/sports-clubs/format.ts's CATEGORY_OPTIONS).
  category: text('category'),
  // The key new field this tab needed that neither events nor camps have: a
  // "fixed_session" activity has a real cohort with its own first/last day
  // (a dance term, a sports season) — sorted by firstDate and hidden by
  // default once started. An "ongoing" activity has no cohort to start late
  // for (a standing weekly club you can join anytime) — sorted by its next
  // upcoming occurrence instead, and never hidden just for being underway.
  // See sports-clubs/sorting.ts for the sort/hide logic this drives.
  scheduleType: text('schedule_type').notNull().default('fixed_session'), // 'fixed_session' | 'ongoing'
  // The cohort's first/last day for a fixed_session activity. Null lastDate
  // means no known end (true for most 'ongoing' rows, which otherwise share
  // this same pair of columns rather than a separate schema shape).
  firstDate: date('first_date'),
  lastDate: date('last_date'),
  // Human-readable schedule pattern ("Every Tuesday, 4:00–5:00pm during the
  // school year") — free text like camps.bookingInstructions, since real
  // recurrence patterns vary too much per provider to usefully structure;
  // the actual ground-truth dates live in sportsClubOccurrences below, which
  // this note summarizes but never generates from.
  cadenceNote: text('cadence_note'),
  ageMin: integer('age_min'), // years
  ageMax: integer('age_max'), // years
  price: numeric('price', { precision: 6, scale: 2 }),
  priceUnit: text('price_unit'), // free text: "per class", "per season", "per month"
  // A standardized weekly-equivalent price (feedback, 2026-08-18: "can you
  // standardize price as a weekly number?") — every listing's price/priceUnit
  // above is genuinely different shapes (per month, per class, per season,
  // per 8-week session...), which makes them hard to compare at a glance.
  // This is a hand-computed conversion from the real price/priceUnit above
  // (never fabricated from nothing — null whenever price itself is null, or
  // when price is a range with no single confirmed figure to convert, e.g.
  // a sliding scale) using the listing's own real known cadence (its actual
  // session length, or a 52/12 weeks-per-month average) — see
  // sports-clubs/seed-2026-08-18-providers.ts and
  // backfill-2026-08-18-price-per-week.ts for the exact per-listing math.
  // Always shown as an approximation (with a "~" prefix — see
  // web/src/sports-clubs/format.ts's priceLabel), never presented as if it
  // were itself a directly published rate; the real price/priceUnit stays
  // visible too (see format.ts's originalPriceLabel), so the standardized
  // number is always traceable back to its real source.
  pricePerWeek: numeric('price_per_week', { precision: 6, scale: 2 }),
  // Escape hatch for anything the single price/priceUnit pair can't capture
  // (a tiered rate, a sibling discount) — mirrors camps.optionsNote.
  priceNote: text('price_note'),
  // Structured tier breakdown for a listing with real, distinct bookable
  // options (see SportsClubOptionLine above) — null/empty for the ordinary
  // single-cadence listing, which relies on cadenceNote/price/priceUnit
  // instead. Seed-only, same posture as camps.options — never settable
  // through the member self-service POST/PATCH body.
  options: jsonb('options').$type<SportsClubOptionLine[]>(),
  address: text('address'),
  locationName: text('location_name'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  distanceMiles: numeric('distance_miles', { precision: 5, scale: 2 }), // straight-line miles from Nettelhorst, see sports-clubs/geo.ts
  // Whether sign-up is actually open right now — same enum and same
  // "checked against the real system, not a stated policy" posture as
  // camps.bookingStatus. Null means genuinely unresearched/unconfirmable.
  signupStatus: text('signup_status'), // 'open' | 'full' | 'waitlist' | 'not_opened'
  // Short "how to sign up" blurb, pairs with the sourceUrl link — mirrors
  // camps.bookingInstructions' post-trim "short info, mainly the link" shape.
  signupInstructions: text('signup_instructions'),
  sourceUrl: text('source_url'),
  sourceId: uuid('source_id').references(() => sportsClubSources.id),
  // NOT NULL — same guaranteed-image invariant as events/camps above (real
  // photo or a generated placeholder, computed before every insert).
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  submittedByUserId: uuid('submitted_by_user_id'),
  approvedByUserId: uuid('approved_by_user_id'),
  ...timestamps,
})

// The individual dates a sports_clubs row actually meets on — new to this
// tab, no direct events/camps precedent table (events' recurring listings,
// e.g. the Bike Bus, use many flat event rows sharing one sourceUrl instead,
// which works there because events carry no series-level metadata that
// would risk drifting across N duplicated rows; sports_clubs' ages/cost/
// signup-status genuinely can't be duplicated safely, hence this being a
// real child table instead). Generated for a bounded known window (e.g.
// through the end of the current season/school year), not enumerated
// forever — same approach as the Bike Bus's per-Friday event rows.
export const sportsClubOccurrences = pgTable('sports_club_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  sportsClubId: uuid('sports_club_id')
    .notNull()
    .references(() => sportsClubs.id),
  date: date('date').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  // Escape hatch for a specific deviation from the normal cadence — "make-up
  // session", "moved from Tuesday" — since the actual date/time columns
  // above are already the ground truth for when it really happens.
  note: text('note'),
  ...timestamps,
})

// One row per (user, sports club) ever swiped, toggled via deletedAt — same
// shape as eventInterests/campInterests above.
export const sportsClubInterests = pgTable(
  'sports_club_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    sportsClubId: uuid('sports_club_id')
      .notNull()
      .references(() => sportsClubs.id),
    status: text('status').notNull(), // 'interested' | 'dismissed'
    ...timestamps,
  },
  (table) => [uniqueIndex('sports_club_interests_user_sports_club_idx').on(table.userId, table.sportsClubId)],
)

export const sportsClubComments = pgTable('sports_club_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sportsClubId: uuid('sports_club_id')
    .notNull()
    .references(() => sportsClubs.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  body: text('body').notNull(),
  ...timestamps,
})
