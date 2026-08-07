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
