# Tracker

"When's the next one?" A member's private list of things they want to keep
happening (a date night, a playdate, a trip), each showing when the next one
is planned. Built 2026-10-26.

- Page: `web/public/labs/tracker/index.html` (served at `/labs/tracker/`)
- Server: `api/src/labs/tracker/` (`lab.ts` routes, `db.ts` tables)
- Data: schema `lab_tracker` (tables `tracker_items`, `tracker_entries`)

## Behavior

- Members only: needs a normal, approved Bulbord sign-in. Every query is
  scoped to the signed-in member; another member's ids answer 404, and a
  signed-out request answers 401 (the page then says "Sign in to Bulbord to
  use the tracker").
- First visit seeds four items: Date with Anna, Playdate for Sebrin, Fun trip,
  Hang with a friend. The header + adds an item; each card has a pencil
  (rename) and a trash can (delete, with a confirm).
- Tapping a card opens a date + short note editor (Save / Cancel / Clear
  date). An item's state is its most recently *added* entry. If that date is
  before today (viewer's local time), or there's no entry, the card is red
  with a blank date and "Nothing planned — tap to add one".
- Order: upcoming items first, soonest at the top; then red items,
  alphabetically.
- A date in a different year shows as month + year ("Mar 2027"), next to the
  relative label ("in 5 months").

## API

All under `/labs/tracker` on the API, bearer token as for Bulbord.

- `GET /items`: the member's items, each with `latest` (its most recently
  added entry) or null. Seeds the defaults if the member never had any.
- `POST /items` `{name}` (≤80 chars), `PATCH /items/:id` `{name}`,
  `DELETE /items/:id` (soft delete).
- `POST /items/:id/entries` `{date: "YYYY-MM-DD", note}` (note ≤200 chars).
- `DELETE /entries/:id` (soft delete; "Clear date" uses this).

## Data

`tracker_items` (id, user_id, name, position, timestamps, deleted_at) and
`tracker_entries` (id, item_id → tracker_items, user_id, date, note,
timestamps, deleted_at), created by `db.ts`'s idempotent DDL. Entries are
append-only plus soft delete, which is the lab's history.

2026-10-27: moved from the shared `labs` schema (used by Bulbord's own login)
to `lab_tracker`, owned by the lab's own login, when labs got their own
database logins.
