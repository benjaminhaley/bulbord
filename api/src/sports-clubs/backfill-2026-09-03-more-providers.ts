import 'dotenv/config'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources, type SportsClubOptionLine } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Feedback #124 (2026-08-24), "Make sure these sports and clubs make it":
// YSI, Cub Scouts, i9 Sports, tennis on the lake. Researched and sourced
// following this app's established rigor (Camps' sourcing checklist +
// Sports & Clubs' own per-listing research checklist — see CLAUDE.md):
//
// - "YSI" resolved to Youth Soccer International (ysifc.com), NOT
//   theysifoundation.org (a different, unrelated nonprofit that also
//   answers to "YSI" — checked and ruled out directly, per this app's own
//   "confirm the URL actually resolves to the real, on-topic business"
//   rule). Real per-class schedule/pricing pulled from their live
//   LeagueApps booking widget (widgets.leagueapps.com), not a one-shot
//   summary of the marketing page — 15 real Fall 2026 classes exist across
//   two venues (Alcott, Hawthorne); scoped to Hawthorne Elementary
//   Scholastic Academy (3319 N Clifton Ave) specifically, since that's the
//   real venue close to Nettelhorst (0.64mi) — Alcott's own address wasn't
//   independently confirmed close enough to include. Two real Hawthorne
//   tiers exist: Playmakers (twice-weekly, ages 6-12, real "SIGN UP" open
//   status) and First Touch (Saturdays only at Hawthorne, both currently
//   "SOLD OUT" per the live widget) — both seeded, since a currently-full
//   real class is still a real class (same posture as camps.bookingStatus
//   showing 'full', not hiding it). No independently-published season end
//   date was found (the widget's own per-class rows only show start dates);
//   left honest about that gap in cadenceNote rather than guessing one.
// - i9 Sports: real Fall 2026 Flag Football season at Waveland Lakeshore
//   Fields (0.60mi from Nettelhorst) — Sep 12-Oct 24 2026, 7 Saturdays,
//   pulled from the venue's own real page (JS-rendered; extracted via a
//   headless-browser render, not a static fetch, same technique this app's
//   sourcing checklist already establishes for JS-only pages). Two real
//   leagues, Co-Ed (Grades K-8) and Girls Only (Grades 3-8), same $219 fee;
//   Co-Ed is "Place on Waitlist" (full) while Girls Only is "Register Now"
//   (open) — the listing's own signupStatus reflects the more conservative
//   ('waitlist'), with each option's own real status noted individually.
//   Soccer/T-ball at this same venue were checked but not confirmed within
//   this pass (a different venue ID timed out) — flagged for a future pass,
//   not fabricated here.
// - Tennis On The Lake: real, currently-running junior program at Waveland
//   Park (0.60mi from Nettelhorst — the exact same lakefront complex i9
//   Sports' fields sit in). Structurally an 'ongoing' listing, not
//   fixed_session — their real season is six rolling ~4-week outdoor
//   sessions running April through October every year, not one single
//   cohort with a first/last day, confirmed via their own real session-date
//   table. Real drop-in pricing ($40/hr, $55/1.5hr, $60/2hr) captured as
//   options; exact class day/time isn't published without an account login
//   on their booking portal, left honest about that in cadenceNote rather
//   than guessed.
// - Cub Scouts: no pack is directly affiliated with Nettelhorst itself
//   (checked directly — nothing found), so the real, closest, officially
//   registered pack was used instead: Pack 3889, chartered by St Alphonsus
//   Catholic Church (1429 W Wellington Ave, 1.11mi from Nettelhorst) — found
//   via BeAScout.org's own official unit locator (46 real units within 10mi
//   of 60657, ranked by distance; Pack 3889 is the closest). St Alphonsus is
//   already a known real host organization in this app (see CLAUDE.md's
//   Camps sourcing checklist item 9 — the parish behind Oktoberfest
//   Chicago). No dedicated pack website/schedule was found despite a real
//   search attempt — small volunteer-run packs commonly have none; priced
//   from BSA's own published 2026 national registration fee ($85/year) plus
//   a handbook (~$24) as priceNote, since no local pack due amount is
//   published anywhere findable. Meeting day/time genuinely isn't published
//   either — cadenceNote says so honestly rather than guessing a schedule.

function distanceFromNettelhorst(lat: number, lng: number): string {
  return haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, lat, lng).toFixed(2)
}

interface SourceSpec {
  key: string
  name: string
  url: string
  notes: string
  imageSourceUrls: string[]
}

const SOURCES: SourceSpec[] = [
  {
    key: 'ysi',
    name: 'Youth Soccer International',
    url: 'https://ysifc.com/',
    notes:
      'Real per-class schedule/pricing confirmed via their live LeagueApps booking widget for Fall 2026, scoped to their Hawthorne Elementary venue specifically (the one close to Nettelhorst). Not to be confused with theysifoundation.org, an unrelated nonprofit — checked and ruled out directly.',
    imageSourceUrls: ['https://ysifc.com/', 'https://www.facebook.com/youthsoccerinternational/'],
  },
  {
    key: 'i9sports',
    name: 'i9 Sports — Chicago Northside',
    url: 'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/10276',
    notes:
      'Real Fall 2026 Flag Football season at Waveland Lakeshore Fields, confirmed via headless-browser render of their own JS-rendered venue page (a static fetch returns no program data). Co-Ed league is currently waitlist/full; Girls Only is open.',
    imageSourceUrls: [
      'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/flag-football/10276',
    ],
  },
  {
    key: 'tennisonthelake',
    name: 'Tennis On The Lake',
    url: 'https://www.tennisonthelake.com/kids-outdoor/waveland-park/',
    notes:
      'Real, currently-running junior outdoor tennis program at Waveland Park — six rolling ~4-week sessions April through October every year, confirmed on their own real session-dates page. Exact class day/time requires their booking portal login, not independently published.',
    imageSourceUrls: ['https://www.tennisonthelake.com/kids-outdoor/waveland-park/', 'https://www.tennisonthelake.com/'],
  },
  {
    key: 'cubscoutpack3889',
    name: 'Cub Scout Pack 3889 (St Alphonsus)',
    url: 'https://www.stalphonsuschicago.org/',
    notes:
      'The real, closest officially-registered Cub Scout pack to Nettelhorst per BeAScout.org\'s own unit locator (46 units within 10mi of 60657, ranked by distance) — no pack is directly affiliated with Nettelhorst itself. Chartered by St Alphonsus Catholic Church, an already-known real host organization in this app. No dedicated pack website/schedule found despite a real search — common for small volunteer-run packs; apply via BeAScout.org.',
    imageSourceUrls: ['https://www.stalphonsuschicago.org/', 'https://www.facebook.com/stalphonsuschgo/'],
  },
]

interface ListingSpec {
  sourceKey: string
  title: string
  description: string
  category: string
  scheduleType: 'fixed_session' | 'ongoing'
  firstDate: string | null
  lastDate: string | null
  cadenceNote: string | null
  ageMin: number | null
  ageMax: number | null
  price: string | null
  priceUnit: string | null
  priceNote: string | null
  pricePerWeek?: number
  options?: SportsClubOptionLine[]
  address: string
  locationName?: string
  lat: number
  lng: number
  signupStatus: 'open' | 'full' | 'waitlist' | 'not_opened' | null
  signupInstructions: string
  sourceUrl: string
  occurrenceSpec?: { daysOfWeek: number[]; startTime: string | null; endTime: string | null; skipDates?: string[] }
}

const LISTINGS: ListingSpec[] = [
  {
    sourceKey: 'ysi',
    title: 'Youth Soccer International — Playmakers',
    description:
      'Twice-weekly recreational soccer for elementary-age players — small-sided games, skill development, and friendly competition.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-08-25',
    lastDate: null,
    cadenceNote:
      'Fall 2026 season — classes started the week of Aug 25, 2026, twice weekly (Tue/Sat or Thu/Sat depending on age group). No independently-published season end date was found; contact YSIFC for the full schedule.',
    ageMin: 6,
    ageMax: 12,
    price: '395.00',
    priceUnit: 'per season',
    priceNote: 'Plus a $5.00 processing fee.',
    options: [
      { label: 'Ages 6-7', start_time: null, end_time: null, price: '395.00', price_unit: 'per season', age_min: 6, age_max: 7, note: 'Tuesdays & Saturdays' },
      { label: 'Ages 8-9', start_time: null, end_time: null, price: '395.00', price_unit: 'per season', age_min: 8, age_max: 9, note: 'Tuesdays & Saturdays, or Thursdays & Saturdays' },
      { label: 'Age 10-12', start_time: null, end_time: null, price: '395.00', price_unit: 'per season', age_min: 10, age_max: 12, note: 'Tuesdays & Saturdays' },
    ],
    address: '3319 N Clifton Ave, Chicago, IL 60657',
    locationName: 'Hawthorne Elementary Scholastic Academy',
    lat: 41.9423187,
    lng: -87.6572162,
    signupStatus: 'open',
    signupInstructions: 'Register online via YSIFC\'s registration page.',
    sourceUrl: 'https://ysifc.com/register/',
  },
  {
    sourceKey: 'ysi',
    title: 'Youth Soccer International — First Touch',
    description: 'Once-per-week recreational soccer for younger players, little to no experience needed.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-08-29',
    lastDate: null,
    cadenceNote:
      'Fall 2026 season, Saturday mornings at Hawthorne. No independently-published season end date was found. Both Hawthorne sessions are currently sold out for Fall 2026 — check back for the next season or ask about their waitlist.',
    ageMin: 5,
    ageMax: 9,
    price: '225.00',
    priceUnit: 'per season',
    priceNote: 'Plus a $5.00 processing fee.',
    options: [
      { label: 'Ages 5-6', start_time: '10:00', end_time: '11:00', price: '225.00', price_unit: 'per season', age_min: 5, age_max: 6, note: 'Saturdays — sold out for Fall 2026' },
      { label: 'Ages 7-9', start_time: '09:00', end_time: '10:00', price: '225.00', price_unit: 'per season', age_min: 7, age_max: 9, note: 'Saturdays — sold out for Fall 2026' },
    ],
    address: '3319 N Clifton Ave, Chicago, IL 60657',
    locationName: 'Hawthorne Elementary Scholastic Academy',
    lat: 41.9423187,
    lng: -87.6572162,
    signupStatus: 'full',
    signupInstructions: 'Register online via YSIFC\'s registration page — join the waitlist or check for a future season.',
    sourceUrl: 'https://ysifc.com/register/',
  },
  {
    sourceKey: 'i9sports',
    title: 'i9 Sports Flag Football',
    description: 'Community-based youth flag football league on the Waveland lakefront fields.',
    category: 'Sports & Athletics',
    scheduleType: 'fixed_session',
    firstDate: '2026-09-12',
    lastDate: '2026-10-24',
    cadenceNote: 'Saturdays, 7 weeks — Sep 12 through Oct 24, 2026. Start times vary by grade band (roughly 9am-3pm across the day).',
    ageMin: 5,
    ageMax: 14,
    price: '219.00',
    priceUnit: 'per season',
    priceNote: null,
    options: [
      { label: 'Co-Ed, Grades K-2', start_time: '09:00', end_time: '11:00', price: '219.00', price_unit: 'per season', age_min: 5, age_max: 7, note: 'Waitlist' },
      { label: 'Co-Ed, Grades 3-5', start_time: '09:00', end_time: '13:30', price: '219.00', price_unit: 'per season', age_min: 8, age_max: 10, note: 'Waitlist' },
      { label: 'Co-Ed, Grades 6-8', start_time: '11:00', end_time: '15:00', price: '219.00', price_unit: 'per season', age_min: 11, age_max: 14, note: 'Waitlist' },
      { label: 'Girls Only, Grades 3-8', start_time: '11:00', end_time: '14:00', price: '219.00', price_unit: 'per season', age_min: 8, age_max: 14, note: 'Open' },
    ],
    address: 'Waveland Ave & Recreation Dr, Chicago, IL 60613',
    locationName: 'Waveland Lakeshore Fields',
    lat: 41.9502471,
    lng: -87.6427511,
    signupStatus: 'waitlist',
    signupInstructions: 'Register online — the Co-Ed league is currently full (waitlist); the Girls Only league is still open.',
    sourceUrl: 'https://www.i9sports.com/venues/chicago-northside-waveland-lakeshore-fields-youth-sports-programs/flag-football/10276',
    occurrenceSpec: { daysOfWeek: [6], startTime: null, endTime: null },
  },
  {
    sourceKey: 'tennisonthelake',
    title: 'Tennis On The Lake — Junior Outdoor',
    description:
      'Group tennis lessons for kids, USTA Quickstart methods for younger players (modified rackets/balls/courts), right on the lakefront.',
    category: 'Sports & Athletics',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote:
      'Outdoor season runs April through October, split into six rolling ~4-week sessions (the current session runs Aug 24-Sep 27, 2026; the next is Sep 28-Oct 25, 2026). Exact class days/times are grouped by age and skill level and only shown after creating an account on their registration portal.',
    ageMin: 5,
    ageMax: 17,
    price: '40.00',
    priceUnit: 'per hour (drop-in)',
    priceNote: 'Longer drop-in blocks: $55 for 1.5 hours, $60 for 2 hours. Season-long enrollment pricing is shown at registration.',
    options: [
      { label: 'Drop-in', start_time: null, end_time: null, price: '40.00', price_unit: 'per hour', age_min: 5, age_max: 17, note: null },
      { label: 'Drop-in', start_time: null, end_time: null, price: '55.00', price_unit: 'per 1.5 hours', age_min: 5, age_max: 17, note: null },
      { label: 'Drop-in', start_time: null, end_time: null, price: '60.00', price_unit: 'per 2 hours', age_min: 5, age_max: 17, note: null },
    ],
    address: 'Waveland Park, 3650 N Recreation Dr, Chicago, IL 60613',
    locationName: 'Waveland Park',
    lat: 41.9502471,
    lng: -87.6427511,
    signupStatus: 'open',
    signupInstructions: 'Create an account and register for the current session online.',
    sourceUrl: 'https://www.tennisonthelake.com/kids-outdoor/waveland-park/',
  },
  {
    sourceKey: 'cubscoutpack3889',
    title: 'Cub Scout Pack 3889',
    description:
      'A Boys/Girls Cub Scout pack chartered by St Alphonsus Catholic Church — outdoor adventure, community service, and badge-earning activities for K-5th grade.',
    category: 'Academic & Clubs',
    scheduleType: 'ongoing',
    firstDate: null,
    lastDate: null,
    cadenceNote:
      'Weekly pack meetings during the school year (Sep-Jun) — the exact meeting night isn\'t published; contact the pack directly via BeAScout.org for the current schedule.',
    ageMin: 5,
    ageMax: 11,
    price: '85.00',
    priceUnit: 'per year (BSA national registration)',
    priceNote:
      'Plus a handbook (~$24/year) and any local pack dues (amount not published). BSA\'s published 2026 national annual membership fee.',
    address: '1429 W Wellington Ave, Chicago, IL 60657',
    locationName: 'St Alphonsus Catholic Church',
    lat: 41.9358282,
    lng: -87.664914,
    signupStatus: null,
    signupInstructions: 'Apply via BeAScout.org (search ZIP 60657, Cub Scouts) or contact the pack through St Alphonsus.',
    sourceUrl: 'https://beascout.scouting.org/list/?zip=60657&program%5B%5D=pack',
  },
]

async function main() {
  const insertedSources = await db
    .insert(sportsClubSources)
    .values(SOURCES.map((s) => ({ name: s.name, url: s.url, type: 'provider_website', isActive: true, notes: s.notes })))
    .returning({ id: sportsClubSources.id, name: sportsClubSources.name })

  const sourceIdByKey = new Map<string, string>()
  for (const s of SOURCES) {
    const inserted = insertedSources.find((row) => row.name === s.name)
    if (!inserted) throw new Error(`Failed to find inserted source for ${s.name}`)
    sourceIdByKey.set(s.key, inserted.id)
  }

  const imageBySourceKey = new Map<string, { imageUrl: string; thumbnailUrl: string }>()
  for (const s of SOURCES) {
    const enriched = await enrichSportsClubSourceImage(s.imageSourceUrls)
    imageBySourceKey.set(s.key, enriched ?? (await uploadPlaceholderImage(s.name, 'sportsclubs')))
    console.log(`${s.name}: ${enriched ? 'found a real image' : 'no usable image found, using a placeholder'}`)
  }

  const insertedListings = await db
    .insert(sportsClubs)
    .values(
      LISTINGS.map((l) => {
        const image = imageBySourceKey.get(l.sourceKey)
        if (!image) throw new Error(`No image resolved for source key ${l.sourceKey}`)
        return {
          title: l.title,
          description: l.description,
          category: l.category,
          scheduleType: l.scheduleType,
          firstDate: l.firstDate,
          lastDate: l.lastDate,
          cadenceNote: l.cadenceNote,
          ageMin: l.ageMin,
          ageMax: l.ageMax,
          price: l.price,
          priceUnit: l.priceUnit,
          pricePerWeek: l.pricePerWeek != null ? l.pricePerWeek.toFixed(2) : null,
          priceNote: l.priceNote,
          options: l.options ?? null,
          address: l.address,
          locationName: l.locationName ?? null,
          latitude: l.lat.toFixed(6),
          longitude: l.lng.toFixed(6),
          distanceMiles: distanceFromNettelhorst(l.lat, l.lng),
          signupStatus: l.signupStatus,
          signupInstructions: l.signupInstructions,
          sourceUrl: l.sourceUrl,
          sourceId: sourceIdByKey.get(l.sourceKey)!,
          imageUrl: image.imageUrl,
          thumbnailUrl: image.thumbnailUrl,
          status: 'approved' as const,
        }
      }),
    )
    .returning({ id: sportsClubs.id, title: sportsClubs.title })

  const occurrenceValues = LISTINGS.flatMap((l, i) => {
    if (!l.occurrenceSpec || !l.firstDate || !l.lastDate) return []
    const inserted = insertedListings[i]
    const rows: { date: string; startTime: string | null; endTime: string | null; note: string | null }[] = []
    const cursor = new Date(`${l.firstDate}T00:00:00Z`)
    const end = new Date(`${l.lastDate}T00:00:00Z`)
    while (cursor <= end) {
      if (l.occurrenceSpec.daysOfWeek.includes(cursor.getUTCDay())) {
        rows.push({
          date: cursor.toISOString().slice(0, 10),
          startTime: l.occurrenceSpec.startTime,
          endTime: l.occurrenceSpec.endTime,
          note: null,
        })
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return rows.map((r) => ({ sportsClubId: inserted.id, date: r.date, startTime: r.startTime, endTime: r.endTime, note: r.note }))
  })

  if (occurrenceValues.length > 0) {
    await db.insert(sportsClubOccurrences).values(occurrenceValues)
  }

  await db.insert(eventsLog).values({
    actor: 'claude:backfill-2026-09-03-more-providers',
    action: 'sports_clubs_seeded',
    metadata: {
      sourceCount: insertedSources.length,
      listingCount: insertedListings.length,
      occurrenceCount: occurrenceValues.length,
      reason: 'feedback #124',
    },
  })

  console.log(
    `Seeded ${insertedSources.length} sources, ${insertedListings.length} listings, ${occurrenceValues.length} occurrence rows.`,
  )
}

await main()
process.exit(0)
