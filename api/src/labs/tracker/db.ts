import { date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import type { LabContext } from '../sandbox.js'

// The tracker's tables live in its own schema, `lab_tracker`, reached through
// its own login that can't see anything else (labs/sandbox.ts). They're outside
// the app's Drizzle migration chain: the lab creates them itself with
// idempotent DDL at load. `user_id` is a plain uuid (a Bulbord member id) with
// no foreign key. Removing the lab = `DROP SCHEMA lab_tracker CASCADE; DROP
// ROLE lab_tracker`.
const labs = pgSchema('lab_tracker')

export const trackerItems = labs.table('tracker_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // The goal's type (feedback #189): 'plan', 'progress', 'checkin', 'weekly' or 'often' (see
  // lab.ts). The column is still called `kind` from before goals had types.
  type: text('kind').notNull().default('plan'),
  // plan: how often one should happen, in days (7, 14 or 28).
  periodDays: integer('period_days'),
  // progress: red once the last entry is more than this many days old.
  staleDays: integer('stale_days'),
  // checkin: the days to record, as "0,1" (0 = Sunday).
  weekdays: text('weekdays'),
  // weekly: the target, any this many days a week.
  daysPerWeek: integer('days_per_week'),
  // often: red after this many hours without an answer; the Yes answers to aim
  // for each week.
  everyHours: integer('every_hours'),
  timesPerWeek: integer('times_per_week'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const trackerEntries = labs.table('tracker_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  note: text('note').notNull().default(''),
  // checkin, weekly and often only: 'kept' or 'missed' (often: Yes or No).
  outcome: text('outcome'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

const DDL = `
  CREATE TABLE IF NOT EXISTS lab_tracker.tracker_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS tracker_items_user_idx ON lab_tracker.tracker_items (user_id);
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'next';
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS stale_days integer;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES lab_tracker.tracker_items (id);
  CREATE TABLE IF NOT EXISTS lab_tracker.tracker_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES lab_tracker.tracker_items (id),
    user_id uuid NOT NULL,
    date date NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS period_days integer;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS weekdays text;
  ALTER TABLE lab_tracker.tracker_items ALTER COLUMN kind SET DEFAULT 'plan';
  ALTER TABLE lab_tracker.tracker_entries ADD COLUMN IF NOT EXISTS outcome text;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS days_per_week integer;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS every_hours integer;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS times_per_week integer;
  -- 2026-11-05 (feedback #189): items became goals. A "next one" item is a
  -- plan-ahead goal; each project in a log became its own progress goal, and
  -- the emptied logs are deleted (no member had one in production). parent_id
  -- is unused from here on.
  UPDATE lab_tracker.tracker_items SET kind = 'plan', period_days = coalesce(period_days, 7) WHERE kind = 'next';
  UPDATE lab_tracker.tracker_items p SET kind = 'progress', stale_days = coalesce(l.stale_days, 14), parent_id = NULL
    FROM lab_tracker.tracker_items l WHERE p.kind = 'project' AND l.id = p.parent_id;
  UPDATE lab_tracker.tracker_items SET deleted_at = now() WHERE kind = 'log' AND deleted_at IS NULL;
  DROP INDEX IF EXISTS lab_tracker.tracker_entries_item_idx;
  CREATE INDEX IF NOT EXISTS tracker_entries_item_date_idx ON lab_tracker.tracker_entries (item_id, date);
`

// Its own small connection pool, created on first use, so a misbehaving lab
// query can never starve the app's pool.
let cached: Promise<ReturnType<typeof drizzle>> | null = null

export function trackerDb(ctx: LabContext) {
  cached ??= (async () => {
    const client = postgres(await ctx.databaseUrl(), { max: 2, onnotice: () => {} })
    await client.unsafe(DDL)
    return drizzle(client)
  })().catch((err) => {
    cached = null
    throw err
  })
  return cached
}
