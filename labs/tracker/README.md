# Tracker

A member's private list of goals. Every goal has a title, a description, a
**key action** that turns it red when there's something to do today, and a
**score** from 0 to 100% over the last 8 weeks, which builds up over time and
can't be fixed on any one day. Built 2026-10-26; past entries and project logs
2026-10-29 (feedback #187, #188); reworked into typed goals 2026-11-05
(feedback #189).

- Page: `web/public/labs/tracker/index.html` (served at `/labs/tracker/`)
- Server: `api/src/labs/tracker/` (`lab.ts` routes, `db.ts` tables)
- Data: schema `lab_tracker` (tables `tracker_items`, `tracker_entries`)

## Goal types

Goals of the same type share all their code; a new kind of goal is a new type.
On the page, everything that differs by type lives in one `TYPES` table (what
turns it red, what the card says, the score, its setting, the modal); on the
server, `parseSettings` and the entry rules in `POST /items/:id/entries`.

- **Plan ahead** (`plan`, e.g. see friends, date with Anna, informational
  interview): red until the next one is on the calendar (an entry dated today
  or later). Setting: how often one should happen, every 1, 2 or 4 weeks.
  Score: how many of those periods in the last 8 weeks, counted back from
  today, had an entry dated today or earlier ("2 of 8 weeks"). There's only
  ever one future plan: the server makes a date after today replace it (the old
  one stays as a soft-deleted row), and the submit button says so first ("Replace
  the Nov 30 plan"). Today or earlier is just logged and leaves the plan alone.
- **Keep making progress** (`progress`, e.g. a project): red once the last
  entry is more than N days old, or there's none (setting, default 14). Score:
  how many of the last 8 weeks had an entry. Entries are today or earlier.
- **Check in on set days** (`checkin`, e.g. no drinking on Sundays and
  Mondays): each chosen weekday is recorded Kept or Missed. Red while any
  chosen day in the last 8 weeks (not counting today, which can be recorded
  early but isn't red until it's over) has no record, which is meant to force
  catching up. Score: kept days ÷ the chosen days in the window (today counts
  once recorded); an unrecorded day counts as not kept. One record per day: a
  new one replaces it, and tapping the chosen answer again clears it.

## Behavior

- Members only: needs a normal, approved Bulbord sign-in. Every query is
  scoped to the signed-in member; another member's ids answer 404, and a
  signed-out request answers 401 (the page then says "Sign in to Bulbord to
  use the tracker").
- First visit seeds four plan-ahead goals: Date with Anna, Playdate for
  Sebrin, Fun trip, Hang with a friend. The header + adds a goal (type, title,
  description, the type's setting) at the top of the list.
- The list is one line per goal (2026-11-05, Ben: "basically one line"): a
  red or green bar, the title, and the score as a ring, filled to the percent
  and colored by how good it is (green from 75%, amber from 40%, red below).
- Tapping a goal's line expands that card in place (one at a time), the line
  staying on top as its header; tapping it again folds it back. Its order holds
  still while it's open. The details, reworked 2026-11-08 (Ben: "pretty clunky",
  "happy experience when I click in"), show only what's needed:
  - The description, if any.
  - A tinted status box: why it's red or green and when that changes ("Green:
    progress 3 days ago / Turns red in 8 days without more."). A plan's next one
    lives here, not in its own section.
  - "Score: 1 of the last 8 weeks" over one mark per period, oldest to newest.
    The percent is the ring above, so it isn't repeated.
  - The one action. Plan and progress: a button (filled when red) that opens the
    date and note. Check-in: one dot per chosen day (✓ kept, ✕ missed, blank) and
    one question at a time, Kept / Missed, moving on to the next unanswered day;
    tapping a dot asks about that day, and tapping its answer again clears it.
  - History (plan, progress): the latest 3, then "Show all N". Each has a small ✕.
  - Edit goal (everything but the type; the form replaces the details), with
    Delete goal inside it.
- Red and the score are derived on the page in the viewer's time zone, which
  sends its `today` with each new entry so the server's date rules match.
- Order: upcoming plans first (soonest at the top), then other green goals,
  then everything red, alphabetically.
- Dates in lists include the year when it isn't this one.

## API

All under `/labs/tracker` on the API, bearer token as for Bulbord.

- `GET /items`: the member's goals, each `{id, name, description, type:
  'plan' | 'progress' | 'checkin', period_days, stale_days, weekdays,
  entries}` (only the type's own setting is set; `weekdays` is `[0, 1]`, 0 =
  Sunday). `entries` (`{id, date, note, outcome}`) are every live entry,
  newest date first. Seeds the defaults if the member never had any goal.
- `POST /items` `{name, description?, type?, period_days? | stale_days? |
  weekdays?}` (title ≤80 chars, description ≤500, period 7/14/28, days
  1–3650, at least one weekday). `PATCH /items/:id` takes the same fields but
  not a different type. `DELETE /items/:id` (soft delete).
- `POST /items/:id/entries` `{date: "YYYY-MM-DD", note?, outcome?, today?}`
  (note ≤200 chars; `outcome` `'kept' | 'missed'`, check-in only; `today`
  defaults to the server's UTC date). Rules per type as above.
  `DELETE /entries/:id` (soft delete).
- Tested in `api/src/labs/tracker/lab.test.ts` (real Postgres).

## Data

`tracker_items` (id, user_id, name, description, kind = the goal type,
period_days, stale_days, weekdays as `"0,1"`, position, timestamps,
deleted_at) and `tracker_entries` (id, item_id → tracker_items, user_id,
date, note, outcome, timestamps, deleted_at), created by `db.ts`'s idempotent
DDL. Entries are soft-deleted only, which is the lab's history.

2026-11-05 (#189): "next one" items became plan-ahead goals (every week); each
project of a log became its own progress goal with the log's days, and the
emptied logs were deleted (no member had a log in production). `parent_id` is
left in the table, unused.

2026-10-27: moved from the shared `labs` schema (used by Bulbord's own login)
to `lab_tracker`, owned by the lab's own login, when labs got their own
database logins.
