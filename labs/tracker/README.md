# Tracker

"When's the next one, and how long since the last?" A member's private list
of things they want to keep happening (a date night, a playdate, a trip),
each showing when the next one is planned, plus logs of projects showing how
long since the last progress. Built 2026-10-26; past entries and logs added
2026-10-29 (feedback #187, #188).

- Page: `web/public/labs/tracker/index.html` (served at `/labs/tracker/`)
- Server: `api/src/labs/tracker/` (`lab.ts` routes, `db.ts` tables)
- Data: schema `lab_tracker` (tables `tracker_items`, `tracker_entries`)

## Behavior

- Members only: needs a normal, approved Bulbord sign-in. Every query is
  scoped to the signed-in member; another member's ids answer 404, and a
  signed-out request answers 401 (the page then says "Sign in to Bulbord to
  use the tracker").
- First visit seeds four "next one" items: Date with Anna, Playdate for
  Sebrin, Fun trip, Hang with a friend. The header + adds an item of either
  kind; each card has a pencil (rename, and a log's red-after days) and a
  trash can (delete, with a confirm; deleting a log deletes its projects).
- **Next one** items: an item's entries can be past or future. The card shows
  the soonest entry dated today or later. With none, it's red ("Nothing
  planned — tap to add one") and, if there's a past entry, "Last one <date> ·
  N ago". Tapping the card opens a modal with one form (date, today by
  default; optional note; Add; feedback #187), then "Next one" (the single
  upcoming entry) and "History" (past entries only, newest first), each
  deletable. The date alone decides which; adding an upcoming date replaces
  the next one rather than stacking a second (2026-10-29, after the first
  two-form version read as confusing and a re-save left a duplicate).
- **Logs** (feedback #188, e.g. "Current projects"): a card listing projects,
  each with how long since its last entry ("today", "9 days ago", "never"),
  stalest first. A project goes red once that's more than the log's
  `stale_days` (asked for in the add form only when Log is picked, default
  14; changeable with the pencil, not shown on the card), and the whole card is red if any
  project is. "+ Add project" adds one; tapping a project opens a modal: log
  the same one form (date ≤ today), its past entries, rename/delete the
  project.
- The modal pushes a history state, so the phone's back gesture closes it.
- Order: upcoming next-ones first (soonest at the top), then logs that are on
  track, then everything red, alphabetically.
- A date in a different year shows as month + year ("Mar 2027"), next to the
  relative label ("in 5 months").

## API

All under `/labs/tracker` on the API, bearer token as for Bulbord.

- `GET /items`: the member's top-level items, each `{id, name, kind: 'next' |
  'log', stale_days, entries, projects}`. `entries` are every live entry,
  newest date first; a log's `projects` are `{id, name, entries}`. The page
  derives next/last/red from these in the viewer's time zone. Seeds the
  defaults if the member never had any.
- `POST /items` `{name, kind?, stale_days?}` (name ≤80 chars, days 1–3650),
  or `{name, parent_id}` for a project in one of the member's logs.
  `PATCH /items/:id` `{name?, stale_days?}` (days only on a log),
  `DELETE /items/:id` (soft delete, a log's projects too).
- `POST /items/:id/entries` `{date: "YYYY-MM-DD", note}` (note ≤200 chars) on
  a next item or a project, not a log. `PATCH /entries/:id` `{date?, note?}`,
  `DELETE /entries/:id` (soft delete).
- Tested in `api/src/labs/tracker/lab.test.ts` (real Postgres).

## Data

`tracker_items` (id, user_id, name, kind, stale_days, parent_id → a log,
position, timestamps, deleted_at) and `tracker_entries` (id, item_id →
tracker_items, user_id, date, note, timestamps, deleted_at), created by
`db.ts`'s idempotent DDL (the 2026-10-29 columns are `ADD COLUMN IF NOT
EXISTS`). Entries are soft-deleted only, which is the lab's history.

2026-10-27: moved from the shared `labs` schema (used by Bulbord's own login)
to `lab_tracker`, owned by the lab's own login, when labs got their own
database logins.
