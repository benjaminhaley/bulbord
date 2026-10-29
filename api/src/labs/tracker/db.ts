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
  // 'next' (when's the next one?), 'log' (a group of projects: how long since
  // the last progress?), or 'project' (one row inside a log, via parent_id).
  kind: text('kind').notNull().default('next'),
  // A log turns red once a project's last entry is more than this many days old.
  staleDays: integer('stale_days'),
  parentId: uuid('parent_id'),
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
  CREATE INDEX IF NOT EXISTS tracker_entries_item_idx ON lab_tracker.tracker_entries (item_id, created_at);
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
