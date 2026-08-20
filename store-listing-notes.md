# Bulbord — store listing draft (feedback #61)

Working notes for App Store Connect / Play Console submission forms. Not part of the app itself — reference only.

## App name
**Bulbord** (per branding decision, 2026-08-07). Subtitle/short description can name Nettelhorst specifically
since that's the only live community today.

## Short description (Play Store, ≤80 chars)
"A private community bulletin board for events and camps — invite-only."

## Full description
```
Bulbord is a private, invite-only bulletin board for your school or neighborhood community — starting with
Nettelhorst. Find and post local kids' events, browse camps organized by school break, mark what you're
interested in, and see who else from your community is going.

You need an invite from an existing member to join — there's no public browsing, and no ads. Sign in with a
passkey (Face ID, Touch ID, or your device's built-in biometric) — no password to remember.

What you can do:
• Browse upcoming community events and camps, organized by date
• Post your own event or camp listing
• See attendance signals like "3 interested: You, Alice and Bob"
• Comment on listings
• Get a weekly email digest of what's coming up
```

## Privacy policy URL
https://bulbord.com/privacy.html (also served at https://nettelhorst.bulbord.com/privacy.html — static page,
no login required, see web/public/privacy.html)

## Support URL / contact
mailto:benjamin.haley@gmail.com (matches the About page's existing contact info)

## Apple "App Privacy" (data collection) questionnaire — draft answers
Data types collected, linked to the user's identity:
- Contact Info: Name, Email Address
- User Content: Photos, Other User Content (event/camp/feedback posts, comments)
- Identifiers: User ID (internal account id)
- Usage Data: none tracked beyond what's needed for the app's own features (interest/dismiss state)
Not collected: Location (lat/long on events/camps is the *listing's* location, not the user's device location),
Financial Info, Health & Fitness, Browsing History, Search History, Contacts.
Used for: App Functionality only. Not used for: Third-Party Advertising, Analytics (no analytics SDK is
integrated), Other purposes.
Data linked to user vs. not: all of the above is linked to the account (invite-only, no anonymous usage).
Tracking: No — Bulbord does not track users across other companies' apps/websites (no ATT prompt needed).

## Apple Guideline 4.2 (minimum functionality) talking points
The app is a WebView shell, but ships with real native device capability beyond a bare browser wrapper:
- Native passkey/WebAuthn sign-in via the OS credential manager (Face ID/Touch ID/Android biometric), not a
  web-only fallback
- Native share sheet integration (`navigator.share`) for the app's invite/share flow
- Designed and tested specifically for a mobile app shell (single-viewport, native-feeling navigation), not a
  generic desktop site reflowed into a WebView
If the review mentions 4.2, lead with the passkey integration first — it's the clearest "this needs the device,
not just a browser" argument.

## Google Play data safety form — same answers as Apple's above, mapped to Play's categories
(Personal info: Name, Email; Photos and videos: Photos; App activity: none beyond in-app interest state)

## Content rating questionnaire
No user-generated content moderation gate exists on the Feedback tab (intentionally, per CLAUDE.md — it's
low-traffic and Ben-only today) or on self-submitted events/camps (also unmoderated, goes live immediately).
Flag this honestly on both stores' content-rating forms (UGC present, no pre-moderation) rather than
under-declaring it — likely lands as a mild/teen-adjacent rating rather than "everyone," which is fine for this
audience (parents/staff, not children).

## Screenshots
Capture from the live app once a build exists — Events list, Camps school-break accordion, an event detail page,
the join/invite screen. Pixel-7-equivalent portrait viewport matches what Playwright's e2e config already uses
(see CLAUDE.md's Testing section) — reuse that device profile for screenshot capture too.

## Guideline 2.1 rejection response (2026-08-15)

Apple rejected the build asking for more detail in App Review Information, not for a bug fix — no code change
needed, just a fuller Notes for Review. Two of Apple's 7 asks need Ben's own action (a screen recording can only
be captured on his physical device; the tested-device list needs his own device model/OS), everything else is
drafted below ready to paste into App Store Connect's Notes field. **This whole response goes in one paste** —
Apple's instructions say to include #1-6 in the Notes field for *future* submissions, so all of it belongs there
together, not just the parts that changed.

**Fresh demo account link** (App Review account, `?signInToken=` mechanism per Login/Platform strategy in
CLAUDE.md): minted 2026-08-15, verified live against production (`GET /auth/me` returned 200 with the reviewer
profile) —
```
https://nettelhorst.bulbord.com/?signInToken=ODlU_xHPZJBSv7YsAbzvVIXGUlfbcNqWaT3lwk5s2l0
```
This is a bearer token with no expiry once set (see Login's Sign-in link entry) — but if a future reviewer
reports it not working, re-mint one with
`DATABASE_URL=<Postgres DATABASE_PUBLIC_URL> npx tsx src/auth/update-2026-08-15-mint-reviewer-session.ts` from
`api/` (script is now committed, reusable for future submissions — looks up the existing App Review account by
email rather than creating a new one).

---

### Draft reply for App Store Connect's Notes field

**1. Screen recording** — [Ben to record: launch the app on your device → land on the join/sign-in screen →
sign in (use the demo link above, or your own passkey) → Events tab (scroll list, tap into one event's detail
page, back out) → Camps tab (expand a school-break section, tap into one camp's detail page) → Friends/Account
page. No purchase/subscription flow exists in this app (nothing to record there). No sensitive-data permission
prompts exist either — the only device capability the app touches is the passkey/biometric prompt during sign-in
and the OS share sheet, both worth including if they trigger naturally in the flow above.]

**2. Devices/OS tested** — [Ben to fill in: model + iOS version build 14 was verified on, e.g. "iPhone 14 Pro,
iOS 17.5". Also worth adding here: automated Playwright end-to-end tests run in CI on every push, covering the
full passkey registration/login ceremony via Chrome DevTools Protocol's virtual authenticator — this is in
addition to, not instead of, the on-device manual pass.]

**3. App description, target audience, problem it solves**

Bulbord is a private, invite-only community bulletin board that helps parents and school staff find local kids'
events and day-off camp care. It's currently used by one community, Nettelhorst Elementary School in Chicago
(nettelhorst.bulbord.com); the app is branded at the platform level ("Bulbord") so future school/neighborhood
communities can be added as their own subdomains without a new app release.

The core problem: school covers ~180 days a year of reliable, easy-to-arrange childcare, but the remaining days
(summer break, winter/spring break, random school-closure days) are a genuinely hard, time-consuming search
problem for working parents — comparing camp providers, hours, prices, and age ranges scattered across dozens of
individual business websites. Bulbord centralizes that into one browsable, school-specific list, organized by
which school break each camp falls under, with real researched details (hours, price, age range, what to bring,
booking link) shown consistently for every listing. A second tab does the same for one-off community events
(park district programs, library events, school-adjacent happenings). A lightweight social layer (who from your
own school community has starred/is going to a listing, an invite-based "friends" list) supplies the
word-of-mouth trust signal that's normally the only way parents currently evaluate these options.

Target audience: parents/guardians and staff at Nettelhorst Elementary School today; the same audience at other
individual school or neighborhood communities once onboarded.

**4. Setup and access instructions**

The app is invite-only — there's no public/anonymous browsing by design (a member vouches for who they invite,
the same way you'd share this kind of thing with a trusted neighbor). For review, sign in directly with the demo
link above (no passkey ceremony needed — it delivers an already-authenticated session, since the app's own login
method is device-passkey/biometric-only and has no username/password). Once signed in, every core feature
(Events tab, Camps tab, Friends, Feedback, Account) is immediately reachable from the tab bar — no further setup
or paid unlock required.

**5. External services used**

- WebAuthn/passkeys — native OS credential manager (Face ID/Touch ID/Android biometric), not a third-party auth
  SDK
- Resend — transactional/newsletter email delivery (weekly digest, friend-connection alerts, unsubscribe links)
- Railway — application hosting, Postgres database, and private S3-compatible object storage for user-uploaded
  and sourced images (served through our own backend proxy, never a public bucket URL)
- Anthropic Claude API — two narrow, optional backend uses: (a) shortening long scraped event titles for
  display, (b) an admin-triggered tool that extracts candidate events from a known community source page's text
  into structured fields for a moderator to review before anything goes live. Both gracefully no-op if
  unavailable; neither is user-facing AI chat/generation.
- Wikipedia's public API — looked up only for a movie's official poster image when a recurring "Movie Night"
  listing names a film; keyless, no account/credential involved
- Google Maps / Google Calendar / Outlook.com — plain outbound web links only (an address opens Maps in a
  browser tab, an "Add to Calendar" button opens a prefilled calendar-service page or downloads a standard .ics
  file) — no API key, SDK, or account linkage on our side

**6. Regional differences**

None — every feature functions identically regardless of region. The app's *content* is scoped to one specific
school community's local area (Chicago), but that's a content/data choice, not a region-gated feature — someone
opening the app from any region sees the same app behavior, just local listings relevant to that one community.

**7. Regulated industry / protected third-party material**

Not applicable. The app doesn't operate in a regulated industry (no health, financial, or legal services) and
doesn't include licensed or protected third-party material — event/camp listing photos are either the poster's
own upload, an image drawn from that specific business's own public webpage (their own og:image/logo, shown only
as an informational reference alongside a link back to their own site), or a generated placeholder graphic when
no real photo is available.

## Second Guideline 2.1 rejection: sign-in link opened Safari, not the app (2026-08-18)

Submission `1611e93d-aca9-4fa3-b1f2-8d7916cf119e` (still build 14 — this round needed no new binary) came back rejected
again, this time with a real functional finding rather than a missing-info one: "We were unable to sign in since the
provided url leads to a website in Safari... Please provide us a way to access the app (QR code), not the website."

**Root cause**: the `?signInToken=` link only reaches the app's own `appUrlOpen` handler (`web/src/main.tsx`) via a
genuine Universal Link hand-off, which depends on how the link is actually invoked — tapping a real rendered
hyperlink usually works, but pasting into Safari's address bar, or opening from certain review-tooling contexts,
does not trigger the hand-off at all and just loads the plain website. App Store Connect's own demo-account fields
are plain text (`demoAccountName` held the full URL) — there's no way to guarantee *how* a reviewer interacts with
that text, so a mechanism that depends on a real link tap was never going to be reliable here. This is a
well-known category of failure for Universal-Link-based reviewer access, not specific to this app's config (RP ID,
AASA, entitlements were all independently re-checked and are still correct).

**Fix, shipped as a pure web change** (no native rebuild needed — see Platform strategy's WebView-shell
architecture): `web/src/auth/JoinGate.tsx` gained a manual sign-in fallback (`ManualSignInEntry`), reachable from
the dead-end "you need an invitation" screen via a small "Have a sign-in link instead?" toggle. It's a plain text
field + Continue button — pasting the link (or just the bare token) and tapping Continue calls the exact same
`setToken()`/`refresh()` path the URL-param mechanism already used, but entirely from *inside* the running app, so
there's nothing for iOS to intercept or fail to intercept. `web/src/auth/token.ts`'s new `parseSignInToken()`
extracts the token from either a full pasted URL or a bare token. Deployed to production and verified live before
being described to Apple below.

**Updated demo-account fields / Notes for Review** (`appStoreReviewDetail`, same submission/version — resubmitted
via `PATCH /v1/reviewSubmissionItems/{id} {resolved:true}` then `PATCH /v1/reviewSubmissions/{id} {submitted:true}`,
not a new reviewSubmission, per Apple's own "edit items in a submission once before resubmission... click Resubmit"
help text):

- `demoAccountName`: the bare sign-in code (not a URL this time) — same live token as before, reverified against
  production (`GET /auth/me` returned 200) rather than re-minted, since it has no expiry once set.
- `demoAccountPassword`: "N/A — passkey-only app, see Notes for the sign-in code's exact steps"
- Notes: rewritten to give literal in-app tap-path steps (open the app → tap "Sign In" → tap "Have a sign-in link
  instead?" → paste the code → Continue) instead of a tappable link, plus a short explanation of why this method
  was added, so the reviewer isn't left to guess if the first thing they try still doesn't work.

General lesson for any future submission: **never make reviewer access depend on a Universal Link actually
firing** — build (or reuse) a plain in-app manual-entry path for any credential-delivery mechanism, since a
review environment's exact tap/paste behavior isn't something this codebase can control or fully test for.

**Outcome**: fix deployed and verified live end-to-end (a real headless-browser run against production — open the
app → tap Sign In → tap "Have a sign-in link instead?" → paste the demo token → Continue — landed in the real
Events tab, screenshotted) before touching App Store Connect. `PATCH appStoreReviewDetails` (new demo account
fields/notes above) → `PATCH reviewSubmissionItems/{id} {resolved:true}` → `PATCH reviewSubmissions/{id}
{submitted:true}` all returned 200; the app version is back to `WAITING_FOR_REVIEW` as of 2026-08-20 16:58 UTC,
same submission id (`1611e93d-...`), no new build. (Note: Railway had an active platform-wide deploy-pipeline
outage — a Google Cloud infra issue — during this pass, which delayed the web deploy by ~45 minutes; unrelated to
this app's own config, resolved by retrying until Railway's queue cleared.)
