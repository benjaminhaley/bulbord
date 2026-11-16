import { boolean, date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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
  // When it asks (feedback #189, 2026-11-16): 'plan', 'progress', 'checkin' or
  // 'often' (see lab.ts). The column is still called `kind` from before goals
  // had types. Unused columns from older designs stay in the table (parent_id,
  // period_days, days_per_week, times_per_week).
  type: text('kind').notNull().default('plan'),
  // progress: red once the last entry is more than this many days old.
  staleDays: integer('stale_days'),
  // checkin: the days to answer, as "0,1" (0 = Sunday).
  weekdays: text('weekdays'),
  // often: red after this many hours without an answer.
  everyHours: integer('every_hours'),
  // Any type: the goal, this many (dates, days or Yes answers) in each this
  // many days (7, 14 or 28).
  targetCount: integer('target_count'),
  targetPeriodDays: integer('target_period_days'),
  // Any type: how the card words its question, in place of the title ('' = the
  // title). The page adds the type's own ending ("… yesterday?").
  question: text('question').notNull().default(''),
  // Any type: whether Yes opens the optional note dialog first (2026-11-13,
  // Ben: off for Healthy eating and yes-and).
  askNote: boolean('ask_note').notNull().default(true),
  // Any type: whether No opens the same note dialog (2026-11-15, Ben: on for
  // Healthy eating, "not when I say yes").
  askNoteNo: boolean('ask_note_no').notNull().default(false),
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
  // checkin and often only: 'kept' or 'missed' (often: Yes or No).
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
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS question text NOT NULL DEFAULT '';
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS ask_note boolean NOT NULL DEFAULT true;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS ask_note_no boolean NOT NULL DEFAULT false;
  -- 2026-11-16: every goal has a target (count per 7, 14 or 28 days), taken
  -- from the old per-type settings; a "some days a week" goal is a check-in on
  -- every day. Runs once: only goals without a target yet.
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS target_count integer;
  ALTER TABLE lab_tracker.tracker_items ADD COLUMN IF NOT EXISTS target_period_days integer;
  UPDATE lab_tracker.tracker_items SET kind = 'checkin', weekdays = '0,1,2,3,4,5,6', target_count = coalesce(days_per_week, 5), target_period_days = 7
    WHERE kind = 'weekly' AND target_count IS NULL;
  UPDATE lab_tracker.tracker_items SET target_count = 1, target_period_days = coalesce(period_days, 7) WHERE kind = 'plan' AND target_count IS NULL;
  UPDATE lab_tracker.tracker_items SET target_count = 1, target_period_days = 7 WHERE kind = 'progress' AND target_count IS NULL;
  UPDATE lab_tracker.tracker_items SET target_count = coalesce(array_length(string_to_array(weekdays, ','), 1), 7), target_period_days = 7
    WHERE kind = 'checkin' AND target_count IS NULL;
  UPDATE lab_tracker.tracker_items SET target_count = coalesce(times_per_week, 10), target_period_days = 7 WHERE kind = 'often' AND target_count IS NULL;
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
