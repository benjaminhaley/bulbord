import { boolean, date, jsonb, numeric, pgTable, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  sourceUrl: text('source_url'),
  sourceId: uuid('source_id').references(() => eventSources.id),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  submittedByUserId: uuid('submitted_by_user_id'),
  approvedByUserId: uuid('approved_by_user_id'),
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
  ...timestamps,
})

// One row per (provider, provider account) a user has linked. Lets Google/Apple
// slot in later as additional rows without touching `users` or existing sessions.
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // 'facebook' | ...
    providerUserId: text('provider_user_id').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('auth_identities_provider_account_idx').on(table.provider, table.providerUserId)],
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
  title: text('title').notNull(),
  description: text('description'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completionNote: text('completion_note'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id),
  ...timestamps,
})

// One-time, short-lived code handed to the browser in the OAuth redirect so
// the real session token is never carried in a URL/browser history. The
// frontend immediately exchanges it for the token via POST /auth/exchange.
export const loginCodes = pgTable(
  'login_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    sessionToken: text('session_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps, // deletedAt doubles as "consumed at"
  },
  (table) => [uniqueIndex('login_codes_code_hash_idx').on(table.codeHash)],
)
