import { boolean, date, jsonb, numeric, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core'

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
