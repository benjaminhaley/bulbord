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
  Mondays): each chosen weekday is recorded Kept or Missed. Red until the most
  recent chosen day is recorded, the only day it asks about (2026-11-09, Ben).
  Today doesn't appear or count until it's over, and older blanks don't turn it
  red (2026-11-08, Ben: based on recordkeeping, not the future).
  Score: kept days ÷ the chosen days in the window; an unrecorded day counts as not kept. One record per day: a
  new one replaces it, and tapping the chosen answer again clears it.
- **Some days a week** (`weekly`, e.g. work on projects, 5 days of 7; 2026-11-09,
  Ben: "the target is 5 of 7, not a particular one"): every day is recorded Did
  it or Didn't, and any of them count. Red until the most recent day (yesterday)
  is recorded, the only day it asks about. Setting: how many days a week, 1 to 7.
  Score: done days ÷ the target over 8 seven-day stretches counted back from
  yesterday, each stretch counting no more than the target ("12 of 40 days").
- **Every few hours** (`often`, e.g. did I think to yes and?; 2026-11-09, Ben):
  the title is the question, answered Yes or No any time, as often as wanted. Red
  once the last answer of either kind is N hours old (default 6), overnight too.
  Settings: those hours, and the Yes answers to aim for each week (default 10).
  Score: Yes answers ÷ the target over 8 seven-day stretches, each counting no
  more than the target. Goes by each entry's `at`, the time it was recorded.

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
  in one neutral blue (red and green only ever mean the status).
- Tapping a goal's line expands that card in place (one at a time), the line
  staying on top as its header; tapping it again folds it back. Its order holds
  still while it's open. The details, reworked 2026-11-08 (Ben: "pretty clunky",
  "happy experience when I click in"), show only what's needed:
  - The description, if any.
  - The question, only while the goal is red: a tinted box with one question
    and its answer buttons, nothing else (2026-11-10, Ben: "a simple question…
    a yes or a no"). Answering turns the goal green, the box goes away, and the
    answer lives in History (Ben: "the ability to answer should go away. It
    should become buried in the history"). The questions: day-by-day goals ask
    about their most recent day ("Did I work on projects yesterday?" Yes / No);
    every few hours "… in the last 6 hours?" Yes / No; progress "… today?" Yes,
    with "Last done 9 days ago" under it; a plan "When's the next one?" with
    Pick a date.
  - Yes always opens a bare note dialog first (2026-11-10, Ben: "very spare"):
    one box with "Describe this (optional)" as its placeholder and one button,
    Skip while it's empty and Enter once there's text (the Enter key works too;
    Escape or tapping outside skips). It's recorded either way, with the note if
    any. No records at once.
  - "Score: 1 of the last 8 weeks" over one mark per period or check-in day,
    oldest to newest (kept green, missed red, blank gray).
    The percent is the ring above, so it isn't repeated.
  - History, folded away as "History (N)". A plan's or progress goal's entries
    have a tap-to-edit date and note and a small ✕, and an "Add a past date"; a
    plan's upcoming one is at the top. A day-by-day goal lists every day with its
    Yes / No (tap the chosen one again to clear it) and note. Every few hours
    lists each answer with its time and note.
  - Settings, folded away behind a gear at the bottom (2026-11-10, Ben: the
    numbers "should be buried under a Settings gear"). First, for every type,
    the Question: the words the question starts with, in place of the title
    (empty = the title; a plan's default is "When's the next one"), with the
    type's ending shown after the box. Then the type's own settings (how often,
    days until red, which days, days a week, hours until red and weekly Yes
    target), all saved at once, then Delete goal as a quiet link. It folds
    again when the card closes. There's no Edit goal (2026-11-08, Ben: tap the
    field, or hold if a tap already does something): the description is
    tap-to-edit, and holding the title line edits the title. The type is fixed.

## One card for every type

(2026-11-10, Ben: "the same code component and design components should be
shared between these cards with settings that impact how they behave… they
should be consistent unless they have some sort of unique customization, and
those unique customizations should appear in the settings.") After the
question was simplified on one type and missed on the others:

- Every card is drawn by the same code (`goalDetails`): description, the
  question (`statusBox`, shown only while red), score, history, Settings. Every
  answer button is `answerButtons`, which is the only place Yes opens the note
  dialog.
- A type in `TYPES` never draws its own status box or buttons. It describes its
  question as data, `ask(goal)` (`stem`, `ending`, `answers: yesno | yes | date`,
  `note`, `answer`), plus what turns it red, its score, its settings and its
  history rows. A change to how cards look or behave goes in the shared code and
  reaches every type; a type differs only through `ask` or a setting.
- Anything one goal does differently from the rest of its type is a setting
  stored on the goal (like `question`), under the gear: there if someone drills
  in, usually set by Claude.

- Red and the score are derived on the page in the viewer's time zone, which
  sends its `today` with each new entry so the server's date rules match.
- Order: everything red first, then upcoming plans (soonest at the top), then
  other green goals, alphabetically. There's no intro text above the list.
- Dates in lists include the year when it isn't this one.

## API

All under `/labs/tracker` on the API, bearer token as for Bulbord.

- `GET /items`: the member's goals, each `{id, name, description, question, type:
  'plan' | 'progress' | 'checkin' | 'weekly' | 'often', period_days, stale_days,
  weekdays, days_per_week, every_hours, times_per_week, entries}` (only the type's own setting is set; `weekdays` is `[0, 1]`, 0 =
  Sunday). `entries` (`{id, date, at, note, outcome}`) are every live entry,
  newest date first. Seeds the defaults if the member never had any goal.
- `POST /items` `{name, description?, question?, type?, period_days? | stale_days? |
  weekdays? | days_per_week? | every_hours? & times_per_week?}` (title ≤80 chars, description ≤500, question ≤120 ('' = the title), period
  7/14/28, days 1–3650, at least one weekday, 1–7 days a week, 1–168 hours, 1–100 times a week). `PATCH /items/:id` takes the same fields but
  not a different type. `DELETE /items/:id` (soft delete).
- `POST /items/:id/entries` `{date: "YYYY-MM-DD", note?, outcome?, today?}`
  (note ≤200 chars; `outcome` `'kept' | 'missed'`, check-in, weekly and every-few-hours only; `today`
  defaults to the server's UTC date). Rules per type as above.
  `PATCH /entries/:id` `{date?, note?, today?}` edits a plan or progress entry
  under the same date rules. `DELETE /entries/:id` (soft delete).
- Tested in `api/src/labs/tracker/lab.test.ts` (real Postgres).

## Data

`tracker_items` (id, user_id, name, description, question, kind = the goal type,
period_days, stale_days, weekdays as `"0,1"`, days_per_week, every_hours, times_per_week, position, timestamps,
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
