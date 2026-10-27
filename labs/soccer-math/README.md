# Soccer Math

A soccer-themed times-tables shootout with a leaderboard, made for a kid to
open without signing in.

- Page: `web/public/labs/soccer-math/` (served at `/labs/soccer-math/`;
  `/soccer-math/` redirects there, for old links and printed QR codes)
- No server, no database: everything (player id, name, leaderboard) is in the
  browser's `localStorage`.

## QR code bundle

The share screen's QR code comes from `qrcode.bundle.js`, a standalone build
of the `qrcode` npm package checked into the lab folder. Regenerate it with
`node web/scripts/build-soccer-math-qr-bundle.mjs` (from the repo root).

## History

The leaderboard was reworked during live play 2026-09-14 to 09-16: one player
id per device is the identity; the leaderboard keeps one best row per player;
a new best saves itself immediately. Every "my X doesn't match my Y" bug so
far was two separate reads of what should be one fact, so check for that
first.

2026-10-27: moved from `/soccer-math/` to `/labs/soccer-math/` so every lab
has the same layout.
