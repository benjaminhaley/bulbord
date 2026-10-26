import { date, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { requireEnv } from '../../env.js'

// The tracker lab's tables live in their own Postgres schema (`labs`), outside
// the app's Drizzle migration chain (drizzle.config.ts only reads
// src/db/schema.ts / the `public` schema), and the lab creates them itself
// with idempotent DDL on first use. No foreign keys into app tables: `user_id`
// is a plain uuid, so nothing in the main schema can ever be blocked by or
// depend on lab data. Removing the lab = `DROP SCHEMA labs CASCADE`.
const labs = pgSchema('labs')

export const trackerItems = labs.table('tracker_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
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
  CREATE SCHEMA IF NOT EXISTS labs;
  CREATE TABLE IF NOT EXISTS labs.tracker_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS tracker_items_user_idx ON labs.tracker_items (user_id);
  CREATE TABLE IF NOT EXISTS labs.tracker_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES labs.tracker_items (id),
    user_id uuid NOT NULL,
    date date NOT NULL,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS tracker_entries_item_idx ON labs.tracker_entries (item_id, created_at);
`

// Its own small connection pool, created on first use, so a misbehaving lab
// query can never starve the app's pool (src/db/client.ts).
let cached: Promise<ReturnType<typeof drizzle>> | null = null

export function trackerDb() {
  cached ??= (async () => {
    const client = postgres(requireEnv('DATABASE_URL'), { max: 2, onnotice: () => {} })
    const db = drizzle(client)
    await client.unsafe(DDL)
    return db
  })().catch((err) => {
    cached = null
    throw err
  })
  return cached
}
