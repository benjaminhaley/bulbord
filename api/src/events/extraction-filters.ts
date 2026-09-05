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
//
// Extended again 2026-09-04, same day, after feedback #155/#156/#157 caught
// three more real listings this same one-shot extraction prompt let through:
// a Northalsted Business Alliance "food and drink sampling crawl" (labeled
// a "neighborhood-wide festival" by the very carve-out this rule's second
// bullet already granted, even though its actual content is walking
// bar-to-bar sampling alcohol — the carve-out was written for a single-site
// fair like Oktoberfest, not a multi-venue crawl, but didn't say so), an
// explicitly 18+ "neurodivergent adults" program held at Lincoln Park Zoo
// (a venue this model already treats as reliably family-friendly, which
// seems to have outweighed the event's own explicit age restriction in its
// holistic judgment), and a "Craft Series" event whose only location was
// "Northalsted" — a whole business district, not a place a person could
// actually navigate to. None of these are a gap in what the rules *say* so
// much as a gap in what they say *precisely enough* — "skip adult-only
// crowds" and "a genuine neighborhood festival is fine" are both already
// here, just not specific enough to survive a holistic per-page judgment
// call under time/token pressure. The three new bullets below close each
// gap with a bright-line, mechanically-checkable trigger instead of a vaguer
// holistic instruction. Because a single extraction prompt has now
// demonstrably let two different categories through despite already having
// a rule that should have caught them, this same rule text is also
// re-checked by a second, independent pass — candidate-validation.ts's
// filterFamilyRelevantCandidates(), called after extraction on the
// structured output rather than the raw page text — so a gap in this
// prompt's own wording isn't the only thing standing between a bad listing
// and going live. See that file's own header for why a second pass, not
// just more rules piled into this one.
//
// Tightened again 2026-09-05, after running the real second-pass validator
// against every already-live approved event to verify it actually worked
// (prompted directly: "I hope you checked all the events with the new
// pipeline to prove that it worked"): it did catch real cases, but also
// produced 5 false positives that would have wrongly rejected perfectly
// good family content on a future re-scrape — a stricter bar was written
// too loosely, not too narrowly. "Penguin Encounter (Ages 6+)" and a zoo
// "Behind-the-Scenes Tour (Ages 13+)" were flagged as age-restricted, even
// though a kid-inclusive MINIMUM age is the opposite of an adults-only
// exclusion; "Adult Book Discussion" and "Show & Tell for Grown-Ups" were
// flagged the same way for a plain library/programming audience-category
// label with no actual exclusion stated. "Lincoln Brunch Fest" (a real
// family-friendly street fest, per its own description) was flagged as a
// vague location for using a bounded street segment ("Lincoln Ave from
// Wellington to Diversey") — the exact same shape as Northalsted Market
// Days' own address, already established elsewhere in this codebase as
// specific enough. "Northalsted Halloween Pup Crawl" (a dog costume walk,
// no alcohol at all) was flagged purely for containing the word "crawl,"
// without checking whether the event actually involves bars/drinking. All
// three bright-line rules below now say explicitly what does NOT count as a
// trigger, not just what does — a rule stated as "watch for X" without also
// saying "but not Y, which looks similar" is exactly the kind of gap this
// whole feedback round was about closing.
export const AUDIENCE_RELEVANCE_RULES = `- This app serves a specific audience: families with kids in pre-K through 8th grade in the Nettelhorst School community. Only include an event if that audience would plausibly find it relevant — skip anything that's really aimed at a different, adult-only, or unrelated crowd, even if it's a real, legitimate, well-described event.
- Skip a bar or restaurant's own recurring drink/entertainment promotion (happy hour, karaoke, trivia night, bottomless brunch/mimosas, wine or cocktail tastings, DJ/dance nights, adult-oriented performances) — these exist to keep the venue's own regular customers coming back, not to draw the broader neighborhood, and they aren't relevant to a family with young kids. A genuine neighborhood-wide festival or street fair (even one that happens to serve food/drink, e.g. an Oktoberfest or a farmers market) is not the same thing and should still be included — but a "crawl" (a pub crawl, bar crawl, progressive dinner, or "food and drink sampling crawl" — the format where you walk between several bars/restaurants sampling food and alcohol at each) is NOT a festival/street fair no matter how it's marketed or how neighborhood-wide it is. The word "crawl" in a title is NOT enough on its own to trigger this — check what the event's own description actually says is happening: a genuine bar/drink crawl (visiting bars/restaurants to sample food and alcohol) should be skipped, but something else that happens to use "crawl" in its name (a costume walk, a pet parade, a scavenger hunt, a fun run) is a different, unrelated format and should NOT be skipped just for sharing that word.
- Skip a purely business-to-business listing (a chamber-of-commerce networking mixer, a retailer's own storefront-design webinar, an industry meetup) — not relevant to a family looking for something to do.
- Skip anything whose own text EXPLICITLY excludes children — a stated numeric age gate meant to keep minors out (e.g. "18+," "21+," "ages 21 and up") or an explicit "adults only"/"no children" statement — even at a venue that's normally reliably family-friendly (a zoo, a library, a museum can all still host an adults-only program); the venue doesn't override the event's own stated audience. Do NOT apply this to a reasonable MINIMUM age meant to include kids/teens, not exclude them — "ages 6+," "ages 13+," or similar on a zoo/museum/library program is a normal safety/maturity requirement for a kid-and-teen-inclusive activity, not an adult-only exclusion, and should be kept. Also do NOT apply this to a plain audience-category label with no actual exclusion stated — a library "Adult Book Discussion" or an "adult"/"grown-ups" branded talk/game night is a normal programming-category term (like "Adult Fiction" vs. "Children's Fiction"), not a stated restriction that children can't attend, so this rule alone doesn't apply to it (a different rule below, about individual pursuits vs. shared family gatherings, may still apply on its own terms).
- Every in-person event needs a specific, real-world location a person could actually navigate to. This can be a street address, a venue/business name specific enough to look up (e.g. "Merlo Branch Library," "Gallagher Way," a named restaurant), OR a street segment bounded by two named cross streets (e.g. "Halsted St between Addison St & Belmont Ave," "Lincoln Ave from Wellington to Diversey," "Southport Ave" alone is also fine as a real street name even without cross streets) — any of these count as specific enough, even though a bounded segment can span several blocks. A neighborhood, business district, or general area name ALONE, with no street or venue name at all (e.g. bare "Northalsted," "Lakeview," "downtown Chicago," "the West Loop," "the Southport corridor" with no street/cross-streets given) is NOT specific enough — if that's genuinely all the page gives for an in-person listing, skip it rather than including it with only an area name. This doesn't apply to a genuinely virtual/online event (a webinar, a virtual info session) — those have no physical location by nature, so a missing address there is correct, not a gap to reject over.
- Skip a regular worship service (a mass, a service) meant for a congregation's own members. Only include a church/religious-organization event if it's explicitly open to and meant for the broader neighborhood (a public festival, a community meeting), not just congregants.
- Skip a notice that something is closed or unavailable (e.g. "Library Closed for X," "No School: X") — this app lists things a family can go to, not things they can't. A day off school is real and useful information, but it belongs in this app's own camp/school-break calendar, not as an Events listing with nothing to attend.
- If this page or email belongs to a specific school, church, or other membership organization that is NOT Nettelhorst itself, only include events that are explicitly open to the broader public/neighborhood — skip anything scoped to that other institution's own members (their own curriculum nights, PTA/parent-association meetings, field trips, fundraisers, closures, graduations) even though it would otherwise sound like a normal family event. A member can end up submitting or discovering a source for a different school entirely (e.g. a photographed flyer from a nearby but unrelated school) — that source may still be worth checking regularly for real public events, but its own internal community programming is not relevant here.
- Only include a recurring neighborhood farmers/artisan market if it's the Nettelhorst French Market itself (held at Nettelhorst School). Skip any other neighborhood's own recurring farmers/artisan market (e.g. Green City Market, a Low-Line Market, a Roscoe Village Farmers Market) even though it's a real, legitimate market — it's the hub for a different community, not Nettelhorst's. This doesn't apply to a one-time seasonal festival that happens to include a market/vendor component (e.g. an Oktoberfest & Fall Market, a "Market Days" street festival) — that's a different kind of event.
- Skip anything that's really an individual paid service or class someone enrolls in on their own (a therapy/support group, a private lesson series, a workshop with pre-registration for both/all participants) rather than a shared gathering a group of neighbors would actually go to together — even when it's a genuinely valuable community resource. The test is "would Nettelhorst families go to this together," not "is this a legitimate, well-run program."
- Skip an event that's explicitly scoped to a narrow subgroup rather than broadly open to the community (e.g. "for families with children impacted by severe illness," an invite-only VIP evening) — this app is for things that would feel accessible and relevant to a significant fraction of Nettelhorst families, not a specific, limited population.
- A charitable tie-in doesn't by itself make a routine promotion into a real community event — "purchases benefit charity X" attached to an ordinary restaurant/bar special (wood-fired pizza night, a happy hour) is still that business's own promotion, not something people are gathering FOR the cause to attend. A genuine organized fundraiser or benefit event is different and should still be included.`
