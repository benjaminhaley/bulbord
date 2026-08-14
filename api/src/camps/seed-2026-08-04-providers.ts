import 'dotenv/config'

import { db } from '../db/client.js'
import { camps, campSources, eventsLog, type CampOptionLine, type CampPrepLine } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichCampSourceImage } from './image-enrichment.js'

// Sourced 2026-08-04 via WebSearch/WebFetch, reviewed live with Ben before
// running — hand-researched, not scraped (see CLAUDE.md's Camps sourcing
// decision). Real providers, real venues, real currently-published pricing
// where a provider publishes it. Coordinates are hand-estimated from
// Chicago's street grid (8 blocks = 1 mile), same convention as the events
// seed scripts' hand-typed lat/long — not a live geocoding call.
//
// Pricing honesty rule (confirmed with Ben, revised 2026-08-05 — see fifth
// follow-up pass below): priceIsEstimated marks a price that is genuinely
// UNCLEAR — inferred, derived, or otherwise uncertain — not simply "not
// individually re-announced for this exact date." Every price below (YMCA
// $70/day, ClimbZone $120/day, Fit City Kids $120/day, Family Room $95/day)
// is the provider's own plainly, currently published standing per-day rate,
// so none of them are marked estimated, even though most of them apply that
// one stated rate across every seeded date rather than a page individually
// naming each date. The frontend only renders "(estimated)" next to a price
// when priceIsEstimated is explicitly true (see camps/format.ts) — reserved
// for a future case where a price genuinely has to be inferred or guessed.
//
// Second follow-up pass (2026-08-04, per feedback): a stricter rule on WHAT
// counts as a real per-day price — never a rate derived by dividing a
// weekly/bulk figure (e.g. a 10-pack price ÷ 10, or a whole-season spending
// average ÷ days), only an actually-published single-day/single-session
// rate. Under this rule: Family Room's price changed from $52 (its Flex Day
// Pass 10-pack ÷ 10) to $35 (their actual, if since-unlisted, single "1 Day
// Pass" product) — still marked estimated since it's not tied to a specific
// date, and it also switched from the Southport location to the Broadway
// location Ben asked for (3229 N Broadway — a few doors from Nettelhorst
// itself). Chicago Park District's price was removed entirely (was $8.34,
// the district's whole-season summer spending average — not a real
// single-day rate for anything, let alone Gill Park's own non-summer "1 Day
// Camp" program specifically) — `pricePerDay: null` is more honest than a
// derived number here, matching the "never fabricate, leave unknown"
// posture the rest of this codebase already follows for missing data.
// Every provider also now has real bookingInstructions (when/how to
// register) and prepInstructions (what to bring/prepare beforehand) —
// researched per provider, not derived or invented.
//
// Also covers every non-attendance day seeded in
// seed-2026-08-04-school-breaks.ts, including the six Professional
// Development days and the two Parent-Teacher Conference days that an
// earlier pass of this script skipped. Summer-week-specific candidates are
// still a good follow-up for a later pass, not included here.
//
// Third follow-up pass (2026-08-04, per feedback): Family Room's price was
// under-researched — Ben pointed directly at their real "Day Camp:
// Single-Day Drop-In Pass" product page, corrected to the real $95 full-day
// rate (see ProviderSpec.familyroom below). Separately, Ben checked Chicago
// Park District's real live registration search (ActiveCommunities) for
// Labor Day and found zero results — unlike the other four recurring-policy
// providers, Park District never states a blanket "every non-attendance
// day" promise, so speculatively generating 17 unverified camp candidates
// for it was itself the mistake, not just the missing price.
// `ProviderSpec.hasRecurringOffering: false` (Park District only) now
// excludes a provider from candidate generation entirely rather than
// guessing; it still gets a real camp_sources row with zero camps, ready to
// be populated once specific dates are confirmed via that search tool.
// Also: every source's URL now points to the actual page you'd go to book
// from (not a generic marketing page) — BitSpace moved to its real
// registration portal (education.bitspacechicago.com) and Park District to
// the ActiveCommunities search itself.
//
// Fourth follow-up pass (2026-08-04, per feedback): Ben's own direct checks
// of two more providers' real pages found the same "assumed every date is
// open, but the real page says otherwise" problem — YMCA's School Days Out
// page confirmed no Labor Day/Sep 25 offering (Oct 12 is the earliest
// open date: see earliestConfirmedDate below), and Fit City Kids' real
// dedicated page (fitcitykids.com/schools-out-camp/ — an earlier pass used
// the generic /camps/ page instead) confirmed no Labor Day offering either,
// with a corrected $120/day full-day (8am-6pm) rate. Applying the same
// scrutiny proactively (not waiting for Ben to catch it) to the two
// remaining recurring-policy providers found ClimbZone's page has no
// evidence either way (their specific dates live behind an iClassPro
// registration portal this codebase can't query, same as Fit City Kids'
// parent portal), but BitSpace's own page explicitly says "Keep an eye out
// for camp options for 2026-27 School Year!" — a stronger finding than a
// partial-year gap, since it means NOTHING is confirmed open yet for any
// seeded date. BitSpace was moved to hasRecurringOffering: false,
// same treatment as Chicago Park District, rather than a partial-year cutoff.
//
// Fifth follow-up pass (2026-08-05, per feedback): Ben flagged Fit City
// Kids' $120/day as wrongly marked "(estimated)" when it's plainly labeled
// on their own page — "we should only show estimate if it is unclear what
// the price will be." The earlier rule conflated two different things: a
// price not tied to one individually-named calendar date (true for nearly
// every row here) versus a price that's actually uncertain (true for none
// of the four providers with real recurring camps generated today).
// priceIsEstimated is now a plain boolean, defaulting to false/confirmed,
// and none of YMCA/ClimbZone/Fit City Kids/Family Room set it — every one
// of their prices is the provider's own clearly published standing rate,
// just applied across every seeded date rather than individually
// re-announced for each. Reserve priceIsEstimated: true for a genuinely
// inferred/derived/uncertain price if one comes up later.
//
// Sixth follow-up pass (2026-08-05, same day, per feedback): three changes.
// (1) pricePerDay stays a single full-day number for the compact list/quick-
// preview line, but a provider with real tiered/add-on pricing (Fit City
// Kids' $85 half-day + $35 extension = $120 full day; Family Room's
// 3/5/9-hour tiers; BitSpace's full-day-vs-half-day age split) now also
// carries `priceDetails`, a short breakdown shown only on the camp detail
// page, making clear which options are actually available rather than
// collapsing them into one number. (2) `breakDateOverrides` lets a provider's
// real hours diverge from a break's full CPS date range — added after Ben
// checked Lake View YMCA's own page directly and found they're only open
// Nov 23-24 during Thanksgiving week, not the full Nov 23-27 break. (3) Every
// provider's `bookingInstructions` was trimmed to a short line — the detail
// page's "Booking" section now pairs brief info with the actual booking link
// prominently alongside it, rather than a paragraph standing in for the link.
// Also: Parent-Teacher Conference Day (Nov 2) and Election Day (Nov 3) are
// merged into one break entry in the `breaks` array below, matching the
// equivalent merge in seed-2026-08-04-school-breaks.ts, since they're
// consecutive dates.
//
// Seventh follow-up pass (2026-08-05, per feedback): exact camp hours must
// be shown up front, "more important than the description" — added
// startTime/endTime (see ProviderSpec below) researched from each
// provider's own real page. This surfaced a real pricing gap at ClimbZone:
// their $120/day only covers the 9:00am-3:30pm day camp block — a separate
// 3:30-5:30pm aftercare add-on ($30) is needed to reach the provider's own
// maximum possible day, 9:00am-5:30pm — so pricePerDay (the single number
// shown in the compact list line) moved to $150, the full max-time total,
// with the breakdown (half-day AM/PM, day-camp-only, aftercare add-on,
// weekly rates, 5% sibling discount) in priceDetails for the new detail-page
// Pricing section. Lake View YMCA (7:00am-6:00pm) and Fit City Kids
// (8:00am-6:00pm, already the $120 max-time total) were confirmed via their
// own real pages/search results and needed no price change. BitSpace's own
// page gives no times at all, only a FULL DAY/HALF DAY age split —
// startTime/endTime are left unset rather than fabricating a time, same
// "never invent, leave unknown" posture as every other honesty rule in this
// file. (Family Room's drop-in pass similarly lets the customer pick their
// own drop-off/pick-up time within a window rather than a fixed schedule —
// startTime/endTime were left unset here too under this same reasoning
// initially, then reversed 2026-08-05: see Family Room's own ProviderSpec
// notes for why its published max-window is now shown instead.) Chicago
// Park District generates no candidates at all today (hasRecurringOffering:
// false), so its hours are moot until real dates are confirmed.
//
// A 7th provider, Unicoi Art Studio, was added the same day via a separate
// script (camps/backfill-2026-08-05-unicoi.ts) rather than by extending the
// PROVIDERS array below — re-running this file's main() would duplicate the
// six providers already live. See that script's own header for the sourcing
// detail: every seeded date was individually confirmed against Unicoi's
// real, live Sawyer booking calendar (not an assumed policy) — the first
// provider with that level of per-date confirmation.

interface BreakInfo {
  name: string
  startDate: string
  endDate: string
}

// Every non-attendance day seeded in seed-2026-08-04-school-breaks.ts except
// Summer Break (handled separately — see file header) — which, as of
// feedback (2026-08-04), no longer includes the five official paid public
// holidays (Labor Day, Indigenous Peoples' Day, MLK Jr. Day, Presidents'
// Day, Memorial Day). See that file's own header comment for why.
const breaks: BreakInfo[] = [
  { name: 'Professional Development Day', startDate: '2026-09-25', endDate: '2026-09-25' },
  // Merged (feedback, 2026-08-05): Parent-Teacher Conference Day (Nov 2) and
  // Election Day (Nov 3) are consecutive dates — see
  // seed-2026-08-04-school-breaks.ts for the matching merged school_breaks row.
  { name: 'Parent-Teacher Conference Day & Election Day', startDate: '2026-11-02', endDate: '2026-11-03' },
  { name: 'Professional Development Day', startDate: '2026-11-11', endDate: '2026-11-11' },
  { name: 'Thanksgiving Break', startDate: '2026-11-23', endDate: '2026-11-27' },
  { name: 'Winter Break', startDate: '2026-12-21', endDate: '2027-01-01' },
  { name: 'Professional Development Day', startDate: '2027-01-04', endDate: '2027-01-04' },
  { name: 'Professional Development Day', startDate: '2027-01-29', endDate: '2027-01-29' },
  { name: 'Professional Development Day', startDate: '2027-02-23', endDate: '2027-02-23' },
  { name: 'Spring Break', startDate: '2027-03-22', endDate: '2027-03-26' },
  { name: 'Professional Development Day', startDate: '2027-04-06', endDate: '2027-04-06' },
  { name: 'Parent-Teacher Conference Day', startDate: '2027-04-12', endDate: '2027-04-12' },
]

interface ProviderSpec {
  key: string
  name: string
  url: string
  notes: string
  address: string
  lat: number
  lng: number
  ageMin: number | null
  ageMax: number | null
  // The provider's own confirmed maximum-possible-day hours (24h "HH:MM"),
  // researched from their real page — not a fixed schedule to leave unset
  // when a provider has none (BitSpace, Family Room; see seventh follow-up
  // note above). pricePerDay should always be the full-day total for this
  // exact startTime-endTime span, not a shorter sub-block (see ClimbZone).
  startTime?: string
  endTime?: string
  pricePerDay: string | null
  // Whether this price is genuinely UNCLEAR — not merely "not tied to one
  // specific calendar date" (fifth follow-up pass, 2026-08-04, per feedback:
  // an earlier version of this file treated every non-individually-dated
  // price as "estimated," which mislabeled a provider's own clearly, plainly
  // published standing per-day rate as a guess). Defaults to false/confirmed
  // — reserve true for a price that's actually inferred/derived/uncertain,
  // not for the common case of "this is the provider's real stated rate,
  // just not re-announced for this exact date."
  priceIsEstimated?: boolean
  // Structured, per-tier breakdown (e.g. Fit City Kids' $85 half-day + $35
  // after-camp extension = $120 full day) — pricePerDay stays the single
  // full-day number shown in the compact list/preview line; this expanded
  // detail only shows on the camp detail page's "Options" section, now a
  // real table (see CampOptionLine in db/schema.ts — 2026-08-05: promoted
  // from a hand-formatted `label`+`detail` string, which itself had earlier
  // replaced a `\n`-joined free-text blob, to real per-field time/age/price
  // structure so every tier lines up in a scannable column — see CLAUDE.md's
  // Camps section for that history).
  //
  // Every real bookable tier gets an explicit age_min/age_max — including
  // when it's the same range as the camp's own ageMin/ageMax below
  // (feedback, 2026-08-05: "whatever in ClimbZone have ages in this table,
  // they do overall. That should be fixed" — an earlier pass left a tier's
  // age null whenever it matched the camp-level range, which just made the
  // table show a misleading "—" for real, known data). ageMin/ageMax below
  // must always equal whichever option anchors pricePerDay/startTime/
  // endTime (the "most expansive" option — the same one those two fields
  // are already keyed to) — never a separately hand-typed number that
  // could drift out of alignment with the table.
  //
  // Every row here is a real bookable tier — a sibling discount or a
  // "weekly rates also available" aside doesn't belong as its own row
  // (feedback, 2026-08-05: "for a thing like sibling discount, don't
  // include it in the list of options table. Instead, there should be some
  // sort of notes field at the bottom of options"); put that in
  // optionsNote below instead. The table itself is sorted most-expensive-
  // first at render time (web/src/camps/format.ts's sortOptionsByPrice),
  // not by this array's own order — no need to hand-sort these.
  options?: CampOptionLine[]
  // A short aside for anything that isn't its own bookable tier — a
  // sibling discount, a weekly rate — shown under the Options table
  // (feedback, 2026-08-05, same as above). Same field a member's own
  // free-text Options note uses (see optionsNote in db/schema.ts);
  // ordinarily member-only, but nothing stops a seed script from using it
  // too.
  optionsNote?: string
  bookingInstructions: string
  // Structured "what to bring / prepare" checklist — see CampPrepLine in
  // db/schema.ts (a simpler label+detail shape than options above — a
  // packing-list item has no time/age/price to decompose into). Consolidate
  // related items into one line rather than fragmenting (e.g. lunch + water
  // bottle → one "Food and drink" item) — fewer, richer items read cleaner
  // than many thin ones.
  prepItems: CampPrepLine[]
  // One tight sentence or two: what campers actually do. Never restate the
  // venue/provider name (it's already the page's `<h1>` title), age range,
  // hours, price, or address — age_min/age_max, start_time/end_time,
  // price_per_day, and address all already have their own always-shown
  // fields on the page, so repeating any of them here is redundant, not
  // helpful (feedback, 2026-08-05, after a screenshot showed "Unicoi Art
  // Studio" as both the title AND the first two words of its own
  // description, and "Ages 4-13" appearing both in the stat line and the
  // description right below it).
  description: string
  sourceUrl: string
  // Real, image-rich page(s) to pull a representative photo/logo from, tried
  // in order (see enrichCampSourceImage) — often different from sourceUrl (a
  // booking/registration page rarely has a usable og:image; a branch/
  // location homepage or About page usually does). A list, not a single URL
  // (2026-08-05, after Unicoi's Facebook fallback turned out to have no
  // usable og:image at all) — always give at least one real fallback beyond
  // a provider's own homepage/booking page when one is known, so a single
  // page's extraction failure doesn't silently leave the camp imageless.
  imageSourceUrls: string[]
  // Whether this provider has a genuine, stated "we run this program on
  // every CPS non-attendance day" policy — true for the four providers whose
  // own sites say exactly that (YMCA, ClimbZone, Fit City Kids, BitSpace),
  // which is what justifies generating a speculative candidate for every
  // break date below. Chicago Park District has no such standing claim —
  // their offerings are per-specific-posted-session in a live registration
  // system (ActiveCommunities), not a blanket promise — so it defaults to
  // false and is inserted as a known camp_sources row with zero speculative
  // camps rather than 17 unverified ones. See its own notes for detail.
  hasRecurringOffering?: boolean
  // Even a provider with a genuine recurring-offering policy can have a real
  // registration system that simply hasn't opened bookings for the earliest
  // break dates yet (found 2026-08-04: Lake View YMCA's own School Days Out
  // page confirmed Labor Day and the Sept 25 PD day are not open for
  // registration, with Oct 12 the earliest currently-open date) — no
  // candidate is generated for any break starting before this date when set.
  earliestConfirmedDate?: string
  // Overrides this provider's actual camp date range for one specific break,
  // keyed by that break's startDate (unique — several breaks share the
  // "Professional Development Day" name) — for when a provider's real hours
  // don't cover a whole multi-day break (found 2026-08-05: Lake View YMCA's
  // own School Days Out page confirmed they're only open Nov 23-24 during
  // Thanksgiving week, not the CPS break's full Nov 23-27 span). Same "trust
  // the provider's real page over an assumed blanket policy" principle as
  // earliestConfirmedDate above, just mid-break instead of at the start.
  breakDateOverrides?: Record<string, { startDate: string; endDate: string }>
  // Whether the provider's REAL registration system currently shows
  // registration as open, full, waitlisted, or not yet opened for this
  // provider's seeded dates (feedback #68, 2026-08-13) — 'open' | 'full' |
  // 'waitlist' | 'not_opened'. Distinct from hasRecurringOffering/
  // earliestConfirmedDate above (which gate whether a candidate is generated
  // at all): this is the live-ish state of a candidate that DOES get
  // generated. Always found by querying the provider's actual booking
  // system directly — never inferred from the marketing page's stated
  // policy — see backfill-2026-08-13-booking-status.ts for exactly how each
  // of the six below was checked (several turned out to have real, public,
  // queryable APIs behind their booking widgets that an earlier research
  // pass had assumed were unqueryable — don't repeat that assumption
  // without trying the real system first). Omitted here (undefined) rather
  // than duplicating a value the backfill script's own header comment
  // already documents in full, since this field isn't read by main()'s
  // insert below — booking_status was added to the schema after this
  // script's one-time run, so it's applied via that separate backfill
  // instead; this field exists for future providers added through this same
  // ProviderSpec shape, and as a template for the next research pass.
  bookingStatus?: 'open' | 'full' | 'waitlist' | 'not_opened'
}

const PROVIDERS: ProviderSpec[] = [
  {
    key: 'ymca',
    name: 'Lake View YMCA',
    url: 'https://www.ymcachicago.org/lake-view/',
    notes:
      '"School Days Out" program, $70/day is the program\'s own clearly stated standing rate (not derived or guessed) at ' +
      'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/ — same price named for Spring Break 2027 (Mar 22-26) and every other date, so it\'s treated as confirmed (not estimated) throughout (feedback, 2026-08-05: "estimated" should mean the price itself is unclear, not merely "not individually re-announced for this date"). Ben checked that page directly (2026-08-04) and confirmed registration is not yet open for Labor Day or the Sep 25 PD day — Oct 12 (Indigenous Peoples\' Day) is the earliest date currently open, so no candidates are generated for the two dates before it (see earliestConfirmedDate below). This mirrors the Chicago Park District fix: a provider stating a general "every non-attendance day" policy doesn\'t guarantee its real registration system has actually opened bookings that far out yet. Ben also checked their Thanksgiving-week hours directly (2026-08-05) and confirmed they only run Nov 23-24, not the full CPS Nov 23-27 break — see breakDateOverrides below.',
    address: '3333 N Marshfield Ave, Chicago, IL 60657',
    lat: 41.9422,
    lng: -87.6692,
    ageMin: 5,
    ageMax: 13,
    // Confirmed via search (2026-08-05): Lake View YMCA's School Days Out
    // program runs 7:00am-6:00pm.
    startTime: '07:00',
    endTime: '18:00',
    pricePerDay: '70.00',
    // A single flat rate, no real tiers — still expressed as a one-row
    // options table (2026-08-05) so the detail page always has the table
    // as its one source of time/age/price once any options exist, rather
    // than YMCA being a special case with none.
    options: [{ label: 'Full day', start_time: '07:00', end_time: '18:00', price: '70.00', age_min: 5, age_max: 13, note: null }],
    earliestConfirmedDate: '2026-10-12',
    breakDateOverrides: {
      '2026-11-23': { startDate: '2026-11-23', endDate: '2026-11-24' },
    },
    bookingInstructions: 'Register online, by phone (773-248-3333), or in person at the front desk.',
    prepItems: [
      { label: 'Food and drink', detail: 'a lunch and a water bottle (no glass)' },
      { label: 'Swimsuit and towel', detail: 'if the day includes pool time' },
      { label: 'Comfortable clothes', detail: 'for active play' },
    ],
    description: '"School Days Out" — a full day of activities while school is out.',
    sourceUrl: 'https://www.ymcachicago.org/early-learning-education/school-age-care/school-days-out/',
    // ymcachicago.org's own pages lazy-load images via JS with no static
    // <img>/og:image in the raw HTML (extractPageImageCandidates found
    // nothing on any of their pages) — their official Facebook page has a
    // real, static og:image instead.
    imageSourceUrls: ['https://www.facebook.com/LakeViewYMCA/'],
  },
  {
    key: 'climbzone',
    name: 'ClimbZone Chicago',
    url: 'https://www.climbzone.us/chicago/camps/',
    notes:
      'States it runs camp on "all CPS days-off-school plus Spring, Summer, Thanksgiving & Winter breaks" with published pricing. ' +
      'Their own page (climbzone.us/chicago/camps/, confirmed 2026-08-05) publishes real per-block hours and prices: full day ' +
      '9:00am-3:30pm is $120/day ($540/week); morning half-day 9:00am-12:00pm and afternoon half-day 12:30-3:30pm are each ' +
      '$70/day ($320/week); aftercare 3:30-5:30pm is a $30/day add-on; a 5% sibling discount applies to camp fees. The ' +
      'provider\'s own maximum possible day is the full day plus aftercare, 9:00am-5:30pm — feedback (2026-08-05) confirmed ' +
      'pricePerDay (the compact list-line number) should reflect that max-time total ($150), not the shorter 9-3:30 block, ' +
      'with the full breakdown in priceDetails for the detail page\'s Pricing section.',
    address: '2500 W Bradley Pl, Chicago, IL 60618',
    lat: 41.9398,
    lng: -87.6886,
    ageMin: 5,
    ageMax: 12,
    startTime: '09:00',
    endTime: '17:30',
    pricePerDay: '150.00',
    options: [
      { label: 'Full day', start_time: '09:00', end_time: '15:30', price: '120.00', age_min: 5, age_max: 12, note: null },
      { label: 'Full day + aftercare', start_time: '09:00', end_time: '17:30', price: '150.00', age_min: 5, age_max: 12, note: null },
      { label: 'Morning half-day', start_time: '09:00', end_time: '12:00', price: '70.00', age_min: 5, age_max: 12, note: null },
      { label: 'Afternoon half-day', start_time: '12:30', end_time: '15:30', price: '70.00', age_min: 5, age_max: 12, note: null },
    ],
    optionsNote: 'Weekly rates also available: $540 (full day), $320 (half-day). 5% sibling discount available.',
    bookingInstructions: 'Sign up online for whichever day(s) you need — no minimum required.',
    prepItems: [
      { label: 'Footwear', detail: 'sneakers or gym shoes' },
      { label: 'Grip socks', detail: 'required in the soft-play area — bring your own or buy a pair on-site' },
      { label: 'Lunch', detail: 'or pre-order one from ClimbZone for $10/child' },
    ],
    description: 'Full-day camp — climbing walls, high ropes, laser tag, and arts and crafts.',
    sourceUrl: 'https://www.climbzone.us/chicago/camps/',
    imageSourceUrls: ['https://www.climbzone.us/chicago/'],
  },
  {
    key: 'fitcitykids',
    name: 'Fit City Kids',
    url: 'https://www.fitcitykids.com/schools-out-camp/',
    notes:
      `"School's Out Camp" — real dedicated page, not the generic /camps/ page an earlier pass used (confirmed 2026-08-04). Full day (8am-6pm) is $85 for the 8am-3pm day camp block plus $35 for the 3pm-6pm after-camp extension, i.e. $120 total for the full 8am-6pm day — Ben's own stated comparison figure. The page says "26-27 School Year Dates Now LIVE!" but individual session dates are only listed on their parent portal (not fetchable as static HTML); Ben checked directly and confirmed there's no Labor Day offering — the schedule starts exactly Sep 25, 2026 (see earliestConfirmedDate below). Their real registration system turned out to be a public Jackrabbit Class "Openings" list (app.jackrabbitclass.com/jr3.0/Openings/OpeningsDirect?OrgID=538382, no login required — found 2026-08-13, see backfill-2026-08-13-booking-status.ts), which confirmed every seeded date is genuinely open with real seats available, AND that Thanksgiving/Winter Break coverage is narrower than first seeded — Thanksgiving is really 11/23-11/25 only (not the full CPS 11/23-11/27) and Winter Break is two separate sessions, 12/21-12/23 and 12/28-12/31 (not one continuous 12/21-1/1) — corrected via backfill-2026-08-13-fitcitykids-break-dates.ts, which split the original single Winter Break row into two.`,
    address: '2540 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6894,
    ageMin: 4,
    ageMax: 12,
    // Their own page's stated hours (confirmed 2026-08-04) — 8am-3pm day
    // camp plus the 3pm-6pm after-camp extension is the full 8:00am-6:00pm
    // day, matching pricePerDay's $120 max-time total below.
    startTime: '08:00',
    endTime: '18:00',
    pricePerDay: '120.00',
    options: [
      { label: 'Day camp', start_time: '08:00', end_time: '15:00', price: '85.00', age_min: null, age_max: null, note: null },
      {
        label: 'Full day + after-camp extension',
        start_time: '08:00',
        end_time: '18:00',
        price: '120.00',
        age_min: null,
        age_max: null,
        note: null,
      },
    ],
    earliestConfirmedDate: '2026-09-25',
    bookingInstructions: 'Register through the parent portal. Email Camps@FitCityKids.com if your date isn\'t listed.',
    prepItems: [
      { label: 'Footwear', detail: 'gym shoes and socks' },
      { label: 'Food and drink', detail: 'a labeled water bottle, a snack, and a lunch' },
    ],
    description: 'Fitness classes and active play.',
    sourceUrl: 'https://www.fitcitykids.com/schools-out-camp/',
    imageSourceUrls: ['https://www.fitcitykids.com/'],
  },
  {
    key: 'bitspace',
    name: 'BitSpace',
    url: 'https://education.bitspacechicago.com/day-off-camps',
    notes:
      `"Day Off Camp" — a standing program for non-attendance days, separate from their week-long summer camp, with a real full-day rate ($150/day, ages 8+) corroborated across three independent searches as of 2026-08-04. But their own bitspacechicago.com/day-off/ page explicitly states "Keep an eye out for camp options for 2026-27 School Year!" — meaning NOTHING is confirmed open yet for any of the seeded 2026-27 break dates (a stronger version of the YMCA/Fit City Kids "not open yet for early dates" finding — here it's the whole year, not just the earliest dates). Following the same principle as Chicago Park District: no speculative candidates are generated (hasRecurringOffering: false) until BitSpace actually opens registration and specific dates can be confirmed. Source URL is the actual registration portal (education.bitspacechicago.com/day-off-camps), not the marketing page — per Ben's direction, the source should be where you'd actually go to book.`,
    address: '2541 W Lawrence Ave, Chicago, IL 60625',
    lat: 41.9688,
    lng: -87.6896,
    ageMin: 8,
    ageMax: null,
    pricePerDay: '150.00',
    options: [
      { label: 'Full day', start_time: null, end_time: null, price: '150.00', age_min: null, age_max: null, note: null },
      { label: 'Half-day', start_time: null, end_time: null, price: null, age_min: 7, age_max: 12, note: null },
    ],
    hasRecurringOffering: false,
    bookingInstructions: 'Register online. Each session needs a minimum of 8 campers to run — register early.',
    prepItems: [
      { label: 'Food and drink', detail: 'a nut-free sack lunch, snacks, and a water bottle' },
      { label: 'Closed-toe shoes', detail: 'no open-toed shoes or crocs' },
      { label: 'Hair tie', detail: 'for long hair' },
      { label: 'Clothes that can get messy', detail: 'no loose jewelry or loose clothing — some days get messy' },
      { label: 'Phone', detail: 'fine for emergencies but must stay zipped in the backpack' },
    ],
    description: '"Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics.',
    sourceUrl: 'https://education.bitspacechicago.com/day-off-camps',
    imageSourceUrls: ['https://bitspacechicago.com/'],
  },
  {
    key: 'parkdistrict',
    name: 'Chicago Park District — Gill Park',
    // The actual registration search tool, per Ben's direction that the
    // source should be where you'd go to book — not the marketing page.
    url: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    notes:
      `A known "1 Day Camp" program exists district-wide and is already a known events source near Nettelhorst (see events/seed-2026-07-31-new-sources.ts), but — unlike YMCA/ClimbZone/Fit City Kids/BitSpace — Chicago Park District never states a blanket "we run this on every non-attendance day" policy; real availability lives in their live ActiveCommunities registration search (anc.apm.activecommunities.com/chicagoparkdistrict/activity/search), which Ben checked directly for Labor Day 2026-09-07 and found zero results. That tool is a JS-rendered SPA this codebase's tooling can't query programmatically, so rather than guess at which (if any) of the seeded break dates might eventually have a real posted session, no speculative camps are generated for this source at all (see hasRecurringOffering below) — it exists here as a known, real source with zero current listings, ready to be populated by a future update script once specific dates are confirmed via that search tool. Also: no genuine single-day price was ever found for this program either — the only figures published anywhere were a whole-season summer spending average and unrelated 2018-era full-program fees for other parks, neither a real per-day rate for anything here.`,
    address: '825 W Sheridan Rd, Chicago, IL 60613',
    lat: 41.9516,
    lng: -87.6473,
    ageMin: 6,
    ageMax: 12,
    pricePerDay: null,
    bookingInstructions: 'Search the registration portal for a posted session, or register in person at the Gill Park fieldhouse.',
    prepItems: [
      { label: 'Bring', detail: 'a backpack and a water bottle' },
      { label: 'Change of clothes', detail: 'if needed' },
      { label: 'Sunscreen', detail: 'apply before arrival' },
      { label: 'Food', detail: 'a free lunch and snack are provided district-wide, though kids are welcome to bring their own' },
    ],
    description: 'Recreational activities, arts and crafts, and sports at the Gill Park fieldhouse.',
    sourceUrl: 'https://anc.apm.activecommunities.com/chicagoparkdistrict/activity/search',
    imageSourceUrls: ['https://www.chicagoparkdistrict.com/parks-facilities/gill-joseph-park'],
    hasRecurringOffering: false,
  },
  {
    key: 'familyroom',
    name: 'Family Room Chicago (Broadway)',
    url: 'https://familyroomchicago.com/shop/camp/day-camp/one-day-camp/family-room-day-camp-single-day-drop-in-pass-lakeview-east/',
    notes:
      'Not a fully structured multi-week curriculum like the other five, but genuinely has its own real "Day Camp: Single-Day Drop-In Pass" product line (confirmed 2026-08-04 — an earlier pass of this script under-researched this and used a generic membership page instead) — included per Ben\'s direction (feedback #50 review). This is their Broadway Clubhouse Suite location specifically (Ben asked for Broadway over the Southport Play Studio; familyroomchicago.com lists three locations total). Price is the real, currently published 9-hour Full-Day Pass rate ($95 non-member) from that product page — tiered pricing also exists for a 3-hour Express Pass ($45) and 5-hour Half-Day Pass ($65), plus member discounts, but the 9-hour rate is what\'s comparable to the other five providers\' full-day rates. Treated as confirmed, not estimated (feedback, 2026-08-05) — the $95 rate itself is plainly published for this exact pass, regardless of which date on the calendar is picked, so there\'s nothing actually unclear about it. The product page has a real date-picker calendar, but as of 2026-08-04 it isn\'t populated with inventory for dates this far out — spots_available is left null/"unknown" for exactly that reason, not because we didn\'t check. `startTime`/`endTime` are set to the provider\'s own published max-window (7:00am drop-off to 6:00pm pick-up) rather than left unset (feedback, 2026-08-05, reversing an earlier "genuinely flexible, don\'t fabricate a time" call: "Family room\'s time definitely should be specified. It\'s clear in the booking text.") — same "show the maximum possible extent" convention ClimbZone\'s time/price already follow, even though the family picks their own exact drop-off/pick-up within that window rather than a single fixed schedule.',
    address: '3229 N Broadway, Chicago, IL 60657',
    lat: 41.94125,
    lng: -87.6447,
    ageMin: 0,
    ageMax: null,
    // The provider's own published max window (see notes above) — drop-off
    // as early as 7:00am, pick-up as late as 6:00pm.
    startTime: '07:00',
    endTime: '18:00',
    pricePerDay: '95.00',
    // Same 7:00am-6:00pm window as the camp-level startTime/endTime above on
    // every pass (feedback, 2026-08-05: "Family room should have times...
    // I think they're the same for all options because you can get a
    // booking within that window") — the family picks their exact
    // drop-off/pick-up within that published window regardless of which
    // pass they buy, so all three genuinely share it rather than each
    // having their own distinct hours.
    options: [
      { label: 'Express Pass', start_time: '07:00', end_time: '18:00', price: '45.00', age_min: null, age_max: null, note: '3 hours' },
      { label: 'Half-Day Pass', start_time: '07:00', end_time: '18:00', price: '65.00', age_min: null, age_max: null, note: '5 hours' },
      { label: 'Full-Day Pass', start_time: '07:00', end_time: '18:00', price: '95.00', age_min: null, age_max: null, note: '9 hours' },
    ],
    // Drop-off/pick-up hours moved to startTime/endTime above (feedback,
    // 2026-08-05: "the part of bookings that's talking about pickup and
    // drop off hours... belong above instead") — this section is now just
    // the actual booking action, not a repeat of the hours.
    bookingInstructions: 'Book online and pick a date.',
    prepItems: [{ label: 'Nothing to pack', detail: 'healthy snacks and a whole-food lunch are included for the day.' }],
    // Trimmed (feedback, 2026-08-05: "the description here should just be
    // supervised sports... all this stuff at the beginning can be cut") —
    // the product name/location were already redundant with the title and
    // address fields above.
    description: 'Supervised sports, free play, and creative activities with a 10:1 camper-to-staff ratio.',
    sourceUrl: 'https://familyroomchicago.com/shop/camp/day-camp/one-day-camp/family-room-day-camp-single-day-drop-in-pass-lakeview-east/',
    // Same lazy-loaded-images issue as YMCA — familyroomchicago.com's own
    // pages only expose a blank placeholder SVG in raw HTML; their Facebook
    // page has a real, static photo instead.
    imageSourceUrls: ['https://www.facebook.com/familyroomchicago/'],
  },
]

function distanceFromNettelhorst(lat: number, lng: number): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, lat, lng).toFixed(2)
}

const candidates = breaks.flatMap((brk) =>
  PROVIDERS.filter((p) => p.hasRecurringOffering ?? true)
    .filter((p) => !p.earliestConfirmedDate || brk.startDate >= p.earliestConfirmedDate)
    .map((p) => {
      const override = p.breakDateOverrides?.[brk.startDate]
      return {
        sourceKey: p.key,
        // Just the provider name — feedback (2026-08-04): a title like "Labor
        // Day YMCA Camp" repeats info already shown as the accordion section
        // header (the break) and the date field below it, and "Camp" is
        // redundant on the Camps tab itself. The provider name is the only
        // genuinely differentiating information at this level.
        title: p.name,
        description: p.description,
        startDate: override?.startDate ?? brk.startDate,
        endDate: override?.endDate ?? brk.endDate,
        startTime: p.startTime ?? null,
        endTime: p.endTime ?? null,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        pricePerDay: p.pricePerDay,
        priceIsEstimated: p.pricePerDay !== null && (p.priceIsEstimated ?? false),
        options: p.options ?? null,
        optionsNote: p.optionsNote ?? null,
        ageMin: p.ageMin,
        ageMax: p.ageMax,
        bookingInstructions: p.bookingInstructions,
        prepItems: p.prepItems,
        sourceUrl: p.sourceUrl,
      }
    }),
)

async function main() {
  const insertedSources = await db
    .insert(campSources)
    .values(PROVIDERS.map((p) => ({ name: p.name, url: p.url, type: 'provider_website', isActive: true, notes: p.notes })))
    .returning({ id: campSources.id, name: campSources.name })

  const sourceIdByKey = new Map<string, string>()
  for (const p of PROVIDERS) {
    const inserted = insertedSources.find((row) => row.name === p.name)
    if (!inserted) throw new Error(`Failed to find inserted source for ${p.name}`)
    sourceIdByKey.set(p.key, inserted.id)
  }

  // One real image fetch per provider (not per camp) — every camp at a given
  // venue shares that venue's real photo/logo. Sequential, not parallel: a
  // handful of one-time network fetches at seed time, not a hot path.
  const imageByKey = new Map<string, { imageUrl: string; thumbnailUrl: string }>()
  for (const p of PROVIDERS) {
    const enriched = await enrichCampSourceImage(p.imageSourceUrls)
    // camps.image_url is NOT NULL — a provider with no usable extracted
    // image still gets a generated placeholder, same as every other insert
    // path (see uploads/placeholder.ts).
    imageByKey.set(p.key, enriched ?? (await uploadPlaceholderImage(p.name, 'camps')))
    console.log(`${p.name}: ${enriched ? 'found a real image' : 'no usable image found, using a placeholder'}`)
  }

  const insertedCamps = await db
    .insert(camps)
    .values(
      candidates.map((c) => {
        const image = imageByKey.get(c.sourceKey)
        if (!image) throw new Error(`No image resolved for source key ${c.sourceKey}`)
        return {
          title: c.title,
          description: c.description,
          startDate: c.startDate,
          endDate: c.endDate,
          address: c.address,
          latitude: c.lat.toFixed(6),
          longitude: c.lng.toFixed(6),
          distanceMiles: distanceFromNettelhorst(c.lat, c.lng),
          startTime: c.startTime,
          endTime: c.endTime,
          pricePerDay: c.pricePerDay,
          priceIsEstimated: c.priceIsEstimated,
          options: c.options,
          optionsNote: c.optionsNote,
          ageMin: c.ageMin,
          ageMax: c.ageMax,
          spotsAvailable: null, // unknown for every seeded row — no provider publishes live availability
          bookingInstructions: c.bookingInstructions,
          prepItems: c.prepItems,
          sourceUrl: c.sourceUrl,
          sourceId: sourceIdByKey.get(c.sourceKey)!,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          status: 'approved' as const,
        }
      }),
    )
    .returning({ id: camps.id })

  await db.insert(eventsLog).values({
    actor: 'system:seed-2026-08-04-providers',
    action: 'camps_seeded',
    metadata: { sourceCount: insertedSources.length, campCount: insertedCamps.length },
  })

  console.log(`Seeded ${insertedSources.length} camp sources and ${insertedCamps.length} camps.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
