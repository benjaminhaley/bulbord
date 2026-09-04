// Shared extraction filtering rules, injected into both resourcing.ts's
// (page-scraping) and email-ingest.ts's (inbound email) system prompts.
// Added 2026-09-04 after feedback #134/#135/#136 flagged several categories
// of real, correctly-scraped listings that still don't belong on a
// Nettelhorst-focused family app: recurring bar/nightlife drink specials
// (happy hour, karaoke, trivia night), a members-only church service, and
// facility-closure notices. Ben's own framing when confirming the bar-event
// removals (feedback #134's clarifying round) generalized the test beyond
// "does this have a bar" or "does this lack neighborhood appeal": the real
// question is whether a Nettelhorst family — pre-K through 8th grade kids —
// would find the listing relevant, not whether the listing is legitimate or
// well-attended in its own right. A single shared string (rather than two
// copies) so the two extraction prompts can't drift on this rule the way
// resourcing.ts/email-ingest.ts already deliberately do stay independent
// implementations otherwise (see each file's own header).
export const AUDIENCE_RELEVANCE_RULES = `- This app serves a specific audience: families with kids in pre-K through 8th grade in the Nettelhorst School community. Only include an event if that audience would plausibly find it relevant — skip anything that's really aimed at a different, adult-only, or unrelated crowd, even if it's a real, legitimate, well-described event.
- Skip a bar or restaurant's own recurring drink/entertainment promotion (happy hour, karaoke, trivia night, bottomless brunch/mimosas, wine or cocktail tastings, DJ/dance nights, adult-oriented performances) — these exist to keep the venue's own regular customers coming back, not to draw the broader neighborhood, and they aren't relevant to a family with young kids. A genuine neighborhood-wide festival or street fair (even one that happens to serve food/drink, e.g. an Oktoberfest or a farmers market) is not the same thing and should still be included.
- Skip a purely business-to-business listing (a chamber-of-commerce networking mixer, a retailer's own storefront-design webinar, an industry meetup) — not relevant to a family looking for something to do.
- Skip a regular worship service (a mass, a service) meant for a congregation's own members. Only include a church/religious-organization event if it's explicitly open to and meant for the broader neighborhood (a public festival, a community meeting), not just congregants.
- Skip a notice that something is closed or unavailable (e.g. "Library Closed for X," "No School: X") — this app lists things a family can go to, not things they can't. A day off school is real and useful information, but it belongs in this app's own camp/school-break calendar, not as an Events listing with nothing to attend.
- If this page or email belongs to a specific school, church, or other membership organization that is NOT Nettelhorst itself, only include events that are explicitly open to the broader public/neighborhood — skip anything scoped to that other institution's own members (their own curriculum nights, PTA/parent-association meetings, field trips, fundraisers, closures, graduations) even though it would otherwise sound like a normal family event. A member can end up submitting or discovering a source for a different school entirely (e.g. a photographed flyer from a nearby but unrelated school) — that source may still be worth checking regularly for real public events, but its own internal community programming is not relevant here.
- Only include a recurring neighborhood farmers/artisan market if it's the Nettelhorst French Market itself (held at Nettelhorst School). Skip any other neighborhood's own recurring farmers/artisan market (e.g. Green City Market, a Low-Line Market, a Roscoe Village Farmers Market) even though it's a real, legitimate market — it's the hub for a different community, not Nettelhorst's. This doesn't apply to a one-time seasonal festival that happens to include a market/vendor component (e.g. an Oktoberfest & Fall Market, a "Market Days" street festival) — that's a different kind of event.`
