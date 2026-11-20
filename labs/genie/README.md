# Genie

One shared screen that listens. Members say what they'd like to see ("let's
play a maze game", "what's the weather", "draw an elephant juggling", "make it
purple") and the page changes for everyone watching it. There's no history and
no navigation: the URL never changes, the page just updates. Feedback #192,
built 2026-11-20.

- Page: `web/public/labs/genie/index.html` (served at `/labs/genie/`)
- Server: `api/src/labs/genie/`, run as **its own Railway service, `genie`**
  (`https://genie-production-9a12f1ec.up.railway.app`), not inside Bulbord's
  API. It's the first lab with its own service, because it makes AI calls
  (labs/README.md: heavier or riskier work gets its own service).
- Data: schema `lab_genie` (tables `genie_pages`, `genie_requests`)

## Decisions (Ben, 2026-11-20)

- **The mic hears everything**, not only a wake word. Every finished phrase
  goes to a cheap, fast gate (Claude Haiku 5.5, ~1s), which decides whether
  it's a request and rebuilds the whole request from the phrases just before it
  (speech recognition splits sentences at pauses; it also fixes mis-hearings
  like "hackman" → "Pac-Man"). Only real requests reach the genie (Claude Opus
  5.5), which writes the new page. Chatter is never stored or shown to anyone.
- **Members talk, anyone watches.** Visitors see the live screen; the mic and
  type buttons send them to sign in.
- **Pictures and videos are drawn by Claude** (SVG/canvas art, animations); no
  image-generation provider.
- **Own Railway service** for isolation.

## How it works

- The page listens with the browser's own speech recognition
  (`webkitSpeechRecognition`: Chrome, Edge, Safari; not Firefox, and not
  inside the iOS app's WebView). Where it isn't available, there's a "type a
  wish" box, which skips the gate. Listening stays on across reloads once
  allowed, and pauses while the tab is hidden.
- `POST /say {text, typed?}` with the member's Bulbord token. The server checks
  the token by calling Bulbord's public `GET /auth/me` (it imports nothing
  from Bulbord) and accepts only approved members (cached 5 min).
- Requests queue up; the genie makes one batch at a time: every request that
  arrived while the last page was being made, oldest first, given the current
  page's HTML so "make it faster" changes what's there.
- Everyone gets the page and progress ("Working on … 12s · 3,400 characters
  written") pushed over server-sent events (`GET /stream`; `GET /state` for a
  one-off read).
- Limits (in memory): 30 phrases a minute and 10 requests per 10 minutes per
  member, at most 6 queued, 60 new pages an hour for everyone.
- Rough timings: weather ~25s, a drawing ~25s, a game ~1.5 min.

## The sandbox

The screen is an `<iframe sandbox="allow-scripts">` showing Genie's HTML as
`srcdoc`. With no `allow-same-origin`, the page runs in an opaque origin: it
can't read the parent page, Bulbord's sign-in token or any storage (checked in
a headless browser: both blocked), can't open popups, submit forms or navigate
the top window, and gets no microphone or camera. The parent prepends a
Content-Security-Policy so scripts load only inline or from
cdnjs/jsdelivr/unpkg; `fetch` to public https APIs works (that's how the
weather page gets live data from Open-Meteo).

On the server side, Genie is a separate process with its own database login
that can only use `lab_genie`, and its only way into Bulbord is the public
`/auth/me`. A crash or runaway can't take Bulbord's API down. In
`scripts/railway-deploy-images.sh` it's marked optional: a failed Genie deploy
warns but doesn't fail Bulbord's deploy.

## Settings (Railway variables on `genie`)

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | same key as the API |
| `BULBORD_API_URL` | `https://api-production-a551.up.railway.app` |
| `GENIE_DATABASE_URL` | the `lab_genie` login (internal host). Its password is derived from `SESSION_SECRET` the same way as other labs (`provisionLabDatabase('genie')` in `api/src/labs/sandbox.ts`), set once by hand. If `SESSION_SECRET` is rotated, re-run that and update this. Unset = state kept in memory. |
| `GENIE_ALLOWED_ORIGINS` | `https://nettelhorst.bulbord.com` |
| `GENIE_EFFORT` | `low` / `medium` (default) / `high` |
| `GENIE_FAST` | `1` turns on fast mode: about 2.5x faster pages at 2x the price |
| `PORT` | `8080` (the domain's target port) |

Start command: `node dist/labs/genie/server.js`; health check `/health`.

## Local

`cd api && npm run genie:dev` (port 3002, reads `api/.env`, checks sign-ins
against the local API on 3001, keeps state in memory). The page uses
`http://localhost:3002` on localhost (or `localStorage.genieApiPort`).

## Removing it

Delete the `genie` Railway service and its row in
`scripts/railway-deploy-images.sh`, then the lab's folders, its `LabsPage` row,
its knip entry and `genie:dev` script, and
`DROP SCHEMA lab_genie CASCADE; DROP ROLE lab_genie;`.
