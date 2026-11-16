# Tracker

A member's private list of goals. Every goal has a title, a description, a
**key action** that turns it red when there's something to do today, and a
**score** from 0 to 100% toward its goal over the last 8 weeks (or since it
started), which builds up over time and can't be fixed on any one day. Built 2026-10-26; past entries and project logs
2026-10-29 (feedback #187, #188); reworked into typed goals 2026-11-05
(feedback #189).

- Page: `web/public/labs/tracker/index.html` (served at `/labs/tracker/`)
- Server: `api/src/labs/tracker/` (`lab.ts` routes, `db.ts` tables)
- Data: schema `lab_tracker` (tables `tracker_items`, `tracker_entries`)

## The parts of a goal

(2026-11-16, Ben: "anything that should be a setting available to every
different type is actually available to every different type", in sub-menus.)
Every goal is made of the same parts, and each is a sub-menu under Settings:

- **When it asks** (the goal's `type`; on the page, the only thing in the
  `TYPES` table; on the server, `parseSettings` and the entry rules in
  `POST /items/:id/entries`):
  - **When nothing's planned** (`plan`, e.g. see friends, date with Anna): red
    until the next one is on the calendar (an entry dated today or later).
    There's only ever one future plan: the server makes a date after today
    replace it (the old one stays as a soft-deleted row). Today or earlier is
    just logged and leaves the plan alone.
  - **After some days without it** (`progress`, e.g. a project): red once the
    last entry is more than N days old, or there's none (`stale_days`, default
    14). Yes only. Entries are today or earlier.
  - **Every day, or on set days** (`checkin`, e.g. no drinking on Sundays and
    Mondays; work on projects 5 days a week): each chosen weekday (`weekdays`)
    is answered Yes or No (stored kept / missed). Red until the most recent
    chosen day is answered, the only day it asks about (2026-11-09, Ben).
    Today doesn't appear or count until it's over, and older blanks don't turn
    it red (2026-11-08, Ben). One record per day: a new one replaces it, and
    tapping the chosen answer again clears it. The old "some days a week" type
    (`weekly`, 2026-11-09) is this on every day with a goal under 7; existing
    ones were converted 2026-11-16.
  - **Every few hours** (`often`, e.g. did I think to yes and?): answered Yes
    or No any time, as often as wanted. Red once the last answer of either kind
    is N hours old (`every_hours`, default 6), overnight too. Up to 168 hours, which reads as "every week" / "… in the last week?"
    (2026-11-16: Playdate for Sebron, asked once a week whether he had a
    playdate with somebody besides Andrew).
  Switching it keeps the goal and the history (see the API for how entries
  carry over) and asks first when entries would change.
- **Goal** (any type): `target_count` a week, every 2 weeks, every 4 weeks or
  a year (`target_period_days` 7 / 14 / 28 / 365; a year added 2026-11-16,
  Ben: Fun trip is "twice a year"): "5 days a week", "1 time every 4 weeks",
  "10 Yes answers a week", "2 times a year". A check-in can't aim for more days than it
  asks about; one that aims for every chosen day keeps doing so when its days
  change. A new goal's default: 1 a week, a check-in's every chosen day, every
  few hours 10 a week.
- **Question**: the words the question starts with, in place of the title.
- **Notes**: whether Yes / No open the optional note dialog (only the answers
  the type has).
- **Title**.

### The score

One function for every type (`scoreOf`). What counts: a plan's or progress
goal's dates (one per day), a check-in's Yes days on its chosen days, every
Yes to an every-few-hours goal. The window is the last 8 weeks (a yearly
goal: the last year, 2026-11-16, Ben: "a one year look back") **or since the
goal started, whichever is shorter** (2026-11-16, Ben: so a new goal doesn't
"start kind of automatically on a bad foot"); started = the day it was
created, or its first entry if that's earlier (past dates logged after creating
it). It ends today (yesterday for a check-in) and is cut into stretches of the
goal's period counted back from there. Each stretch counts up to the goal, so a
big stretch can't make up for a thin one. The oldest stretch, when the goal
started part way into it, aims for its share of the goal, rounded (a check-in:
by its chosen days in it), and counts in full if it reached more. Score =
counted ÷ aimed for. Nothing to score yet while that's 0 (e.g. a check-in made
today). The marks: a check-in's days in the window (green Yes, red No, gray
blank), otherwise one per stretch (green reached, pale green part way).

## Behavior

- Members only: needs a normal, approved Bulbord sign-in. Every query is
  scoped to the signed-in member; another member's ids answer 404, and a
  signed-out request answers 401 (the page then says "Sign in to Bulbord to
  use the tracker").
- First visit seeds four plan-ahead goals: Date with Anna, Playdate for
  Sebrin, Fun trip, Hang with a friend. The header + adds a goal (title,
  description, when it asks and its setting, the goal) at the top of the list.
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
    any. No records at once. The dialog is a per-goal setting, "Ask for a note
    after Yes" (`ask_note`, on by default; 2026-11-13, Ben turned it off for
    Healthy eating and yes-and); off, Yes records straight away. A second
    setting, "Ask for a note after No" (`ask_note_no`, off by default;
    2026-11-15, Ben turned it on for Healthy eating: "not when I say yes"),
    opens the same dialog after No.
  - Answering the question folds the card back to its one line (2026-11-13,
    Ben: it should "shrink back down again"). Answers in History don't.
  - The score's marks, one per period or day, oldest to newest (kept green,
    missed red, blank gray), with no text above them (2026-11-13, Ben:
    "unnecessary and complicated"). Tapping the bar unfolds how this goal's
    score is kept, in words with its current numbers. The percent is the ring
    above, so it isn't repeated.
  - History, folded away as "History (N)". A plan's or progress goal's entries
    have a tap-to-edit date and note and a small ✕, and an "Add a past date"; a
    plan's upcoming one is at the top. A day-by-day goal lists every day with its
    Yes / No (tap the chosen one again to clear it) and note. Every few hours
    lists each answer with its time and note.
  - Settings, folded away behind a gear at the bottom (2026-11-10, Ben: the
    numbers "should be buried under a Settings gear"). Opened, it's a list of
    sub-menus, each row showing its current value with a chevron (2026-11-16,
    Ben: "the settings has kind of sub menus"): Title, Description (optional,
    any type: "Current projects: …"), When it asks, Goal,
    Question, Notes (not on a plan, which has no Yes / No), then Delete goal as
    a quiet link. Tapping a row opens it in place, with "‹ Settings" to go back.
    Each saves as soon as it changes; an invalid value says why and goes back.
    It folds again when the card closes. There's no Edit goal (2026-11-08,
    Ben): the description is tap-to-edit, and holding the title line edits the
    title (also under Settings › Title).

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
  `note`, `answer`), plus what turns it red, its own setting, what its goal
  counts (`unit`) and its history rows. The score, the goal and the notes are
  shared by every type. A change to how cards look or behave goes in the shared code and
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

- `GET /items`: the member's goals, each `{id, name, description, question,
  ask_note, ask_note_no, type: 'plan' | 'progress' | 'checkin' | 'often',
  stale_days, weekdays, every_hours, target_count, target_period_days,
  created_at, entries}` (only the type's own setting is set; `weekdays` is
  `[0, 1]`, 0 = Sunday). `entries` (`{id, date, at, note, outcome}`) are every
  live entry, newest date first. Seeds the defaults if the member never had any
  goal.
- `POST /items` `{name, description?, question?, ask_note?, ask_note_no?,
  type?, stale_days? | weekdays? | every_hours?, target_count?,
  target_period_days?}` (title ≤80 chars, description ≤500, question ≤120 (''
  = the title), days 1–3650, at least one weekday (required for a check-in),
  1–168 hours, goal 1–365 per 7 / 14 / 28 / 365 days, a check-in's lowered to at most
  its days). `PATCH /items/:id` takes the same fields, a
  new `type` included: the new type's setting is given or defaulted (a
  check-in needs `weekdays`), the old type's is cleared, the goal is kept
  (fitted to a check-in's days), and entries carry
  over (to a Yes / No type, a plain date becomes a Yes; to plan or progress, a
  No is soft-deleted and a Yes becomes a plain date). `DELETE /items/:id` (soft delete).
- `POST /items/:id/entries` `{date: "YYYY-MM-DD", note?, outcome?, today?}`
  (note ≤200 chars; `outcome` `'kept' | 'missed'`, check-in and every-few-hours only; `today`
  defaults to the server's UTC date). Rules per type as above.
  `PATCH /entries/:id` `{date?, note?, today?}` edits a plan or progress entry
  under the same date rules. `DELETE /entries/:id` (soft delete).
- Tested in `api/src/labs/tracker/lab.test.ts` (real Postgres).

## Data

`tracker_items` (id, user_id, name, description, question, ask_note,
ask_note_no, kind = the goal type, stale_days, weekdays as `"0,1"`,
every_hours, target_count, target_period_days, position, timestamps,
deleted_at) and `tracker_entries` (id, item_id → tracker_items, user_id,
date, note, outcome, timestamps, deleted_at), created by `db.ts`'s idempotent
DDL. Entries are soft-deleted only, which is the lab's history.

2026-11-05 (#189): "next one" items became plan-ahead goals (every week); each
project of a log became its own progress goal with the log's days, and the
emptied logs were deleted (no member had a log in production). `parent_id` is
left in the table, unused.

2026-11-16: every goal got a goal (`target_count`, `target_period_days`) from
its old setting: a plan's `period_days` became 1 per that many days, progress 1
a week, a check-in every chosen day, every few hours its `times_per_week`; a
`weekly` goal became a check-in on every day aiming for its `days_per_week`.
`period_days`, `days_per_week` and `times_per_week` are left in the table,
unused.

2026-10-27: moved from the shared `labs` schema (used by Bulbord's own login)
to `lab_tracker`, owned by the lab's own login, when labs got their own
database logins.
