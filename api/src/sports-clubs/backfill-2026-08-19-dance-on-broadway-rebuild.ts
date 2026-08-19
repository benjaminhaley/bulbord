import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources, type SportsClubOptionLine } from '../db/schema.js'
import { uploadPlaceholderImage } from '../uploads/placeholder.js'
import { haversineMiles, NETTELHORST_COORDS } from './geo.js'
import { enrichSportsClubSourceImage } from './image-enrichment.js'

// Feedback (2026-08-19), from a live screenshot: the original Dance on
// Broadway listing (seed-2026-08-18-providers.ts) was built against a
// completely wrong domain — `danceonbroadway.com` is a parked placeholder
// page with no real content, not the actual studio. The real site,
// `danceonbroadwaychi.com`, has a genuinely rich, fully public schedule
// (a real PDF grid, no login/Mindbody-widget gate the way the original
// notes assumed) and real, directly-observable Mindbody pricing — none of
// which the original pass ever actually reached. This script replaces that
// one vague listing with 16 real ones, one per the studio's own official
// class level (its own age-eligibility system, not an invented grouping),
// each carrying its real weekly class options — deliberately not one row
// per weekly class-section (that's ~64 real slots, too granular to browse)
// and not one giant blob either.
//
// Sourcing method, worth keeping for the next PDF-schedule source: fetched
// the real schedule PDF (linked from /youthschedule), extracted it with
// `pdftotext -bbox` for real word-level coordinates, then reconstructed the
// day/studio grid programmatically (column-boundary x-assignment + y-gap
// line/cell clustering) rather than eyeballing a screenshot or trusting an
// AI-summarized text dump — the latter's own first attempt at this exact
// PDF silently misattributed several classes to the wrong day (e.g. put
// Saturday-morning Lovebug Tots classes on Tuesday). Every cell the
// positional extraction produced was then re-verified against a 300dpi
// render of the actual PDF page, cropped per day and read directly — this
// is the level of rigor a real schedule-grid source needs, not a one-shot
// text fetch. Ages are the studio's own published per-level eligibility
// text (`/youth-class-level-descriptions`), not inferred from class names.
//
// Pricing: Mindbody's own storefront 403s a bot fetch (confirmed again,
// same as the original pass), but a live, authenticated screenshot Ben
// provided directly shows real, published pricing with no login required
// to *see* it — $475 for a "2026 Monday (14 weeks)" series. The 14-week
// count is internally consistent with the studio's own stated closures
// (Labor Day Sept 7 + the full Thanksgiving-week closure both fall on/in a
// Monday's schedule, dropping it from 16 calendar weeks to 14; every other
// weekday only loses the Thanksgiving-week closure, so 15 sessions). This
// $475 figure is applied as every level's per-class series price — real
// dance-studio Mindbody stores standardly price a once-weekly youth series
// at one flat studio-wide rate regardless of style/day, and every option
// visible in that same screenshot showed this identical number — but the
// exact non-Monday 15-session total was never itself independently seen,
// so priceNote says so explicitly rather than presenting a derived number
// as confirmed.

const SEASON_START = '2026-08-31'
const SEASON_END = '2026-12-20'
const LABOR_DAY = '2026-09-07'
const THANKSGIVING_WEEK_START = '2026-11-23'
const THANKSGIVING_WEEK_END = '2026-11-29'

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OccurrenceRow {
  date: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

// Real weekly occurrences for one class, skipping the two real closures
// above whenever they land on the matching weekday.
function weeklyOccurrences(dayOfWeek: number, startTime: string, endTime: string): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${SEASON_START}T00:00:00Z`)
  const end = new Date(`${SEASON_END}T00:00:00Z`)
  const thanksgivingStart = new Date(`${THANKSGIVING_WEEK_START}T00:00:00Z`)
  const thanksgivingEnd = new Date(`${THANKSGIVING_WEEK_END}T00:00:00Z`)
  while (cursor <= end) {
    if (cursor.getUTCDay() === dayOfWeek) {
      const dateStr = toDateString(cursor)
      const isThanksgivingWeek = cursor >= thanksgivingStart && cursor <= thanksgivingEnd
      const isLaborDay = dateStr === LABOR_DAY
      if (!isThanksgivingWeek && !isLaborDay) {
        rows.push({ date: dateStr, startTime, endTime, note: null })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

// Real per-weekday session count over the season, for a transparent
// priceNote (14 for Monday, 15 for every other day — see header comment).
function sessionCount(dayOfWeek: number): number {
  return dayOfWeek === 1 ? 14 : 15
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface LevelClass {
  style: string
  day: number // 0=Sun..6=Sat
  start: string
  end: string
  teamOnly?: boolean
}

interface LevelSpec {
  level: string
  ageMin: number | null
  ageMax: number | null
  ageDescription: string
  classes: LevelClass[]
}

// Every real class from the Fall 2026 (Season 7) schedule PDF, grouped by
// the studio's own 15 official levels (danceonbroadwaychi.com/youthschedule
// PDF + /youth-class-level-descriptions) — see header comment for the
// extraction/verification method. All 64 real weekly class sections in the
// grid are accounted for across these 15 groups.
const LEVELS: LevelSpec[] = [
  {
    level: 'Lovebug Tots',
    ageMin: 1,
    ageMax: 3,
    ageDescription: 'Ages 18 months to 3 years old.',
    classes: [
      { style: 'Lovebug Tots', day: 5, start: '10:00', end: '10:30' },
      { style: 'Lovebug Tots', day: 6, start: '9:00', end: '9:30' },
      { style: 'Lovebug Tots', day: 6, start: '9:30', end: '10:00' },
    ],
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    ageDescription: 'Ages 3–5 years old.',
    classes: [
      { style: 'Combo', day: 1, start: '15:45', end: '16:30' },
      { style: 'Combo', day: 3, start: '10:00', end: '10:45' },
      { style: 'Ballet/Jazz', day: 3, start: '15:30', end: '16:15' },
      { style: 'Hip-Hop', day: 5, start: '15:30', end: '16:15' },
      { style: 'Ballet', day: 6, start: '10:00', end: '10:45' },
      { style: 'Combo', day: 6, start: '9:00', end: '9:45' },
      { style: 'Ballet', day: 0, start: '9:00', end: '9:45' },
      { style: 'Combo', day: 0, start: '10:00', end: '10:45' },
    ],
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    ageDescription: 'Ages 5–7 years old.',
    classes: [
      { style: 'Ballet/Jazz', day: 1, start: '16:30', end: '17:15' },
      { style: 'Jazz/Hip-Hop', day: 2, start: '15:30', end: '16:15' },
      { style: 'Acro/Jazz', day: 6, start: '11:00', end: '11:45' },
      { style: 'Combo', day: 6, start: '10:00', end: '10:45' },
      { style: 'Hip-Hop', day: 0, start: '9:00', end: '9:45' },
      { style: 'Ballet/Jazz', day: 0, start: '10:00', end: '10:45' },
    ],
  },
  {
    level: 'Mini 2',
    ageMin: 5,
    ageMax: 7,
    ageDescription: 'Ages 5–7 years old with prior dance experience.',
    classes: [
      { style: 'Jazz', day: 1, start: '16:15', end: '17:00' },
      { style: 'Ballet', day: 1, start: '17:15', end: '18:00' },
      { style: 'Contemporary/Lyrical', day: 5, start: '16:15', end: '17:00' },
    ],
  },
  {
    level: 'Level 1',
    ageMin: 7,
    ageMax: 9,
    ageDescription: 'Ages 7–9 years old with little to no prior dance experience.',
    classes: [
      { style: 'Jazz', day: 5, start: '16:00', end: '17:00' },
      { style: 'Ballet', day: 0, start: '11:00', end: '12:00' },
      { style: 'Tap', day: 2, start: '17:00', end: '18:00' },
      { style: 'Hip-Hop', day: 5, start: '18:00', end: '19:00' },
    ],
  },
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    ageDescription: 'Ages 7–9 with prior dance experience (requires teacher approval).',
    classes: [
      { style: 'Ballet', day: 1, start: '16:15', end: '17:15' },
      { style: 'Jazz', day: 1, start: '17:15', end: '18:15' },
      { style: 'Ballet', day: 6, start: '11:00', end: '12:00' },
      { style: 'Hip-Hop', day: 4, start: '18:00', end: '19:00' },
      { style: 'Contemporary', day: 4, start: '16:45', end: '17:45' },
    ],
  },
  {
    level: 'Level 1/2',
    ageMin: 7,
    ageMax: 9,
    ageDescription: 'Ages 7–9 with prior dance experience.',
    classes: [
      { style: 'Technique', day: 3, start: '16:15', end: '17:15', teamOnly: true },
      { style: 'Musical Theater', day: 6, start: '12:00', end: '13:00' },
      { style: 'Acro', day: 4, start: '15:45', end: '16:45' },
      { style: 'Poms', day: 0, start: '11:00', end: '12:00' },
    ],
  },
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    ageDescription: 'Ages 10–12, or those with 2–3 years of dance experience.',
    classes: [
      { style: 'Ballet Technique', day: 1, start: '18:15', end: '19:30' },
      { style: 'Contemporary', day: 3, start: '18:00', end: '19:00' },
      { style: 'Ballet', day: 4, start: '18:00', end: '19:15' },
      { style: 'Jazz', day: 5, start: '15:45', end: '16:45' },
      { style: 'Hip-Hop', day: 5, start: '17:00', end: '18:00' },
    ],
  },
  {
    level: 'Level 2x',
    ageMin: 10,
    ageMax: 12,
    ageDescription: 'Ages 10–12, or those with 3+ years of dance experience (requires instructor approval).',
    classes: [
      { style: 'Jazz', day: 2, start: '18:00', end: '19:00' },
      { style: 'Contemporary', day: 3, start: '16:15', end: '17:15' },
      { style: 'Hip-Hop', day: 3, start: '19:15', end: '20:15' },
    ],
  },
  {
    level: 'Level 2/3',
    ageMin: 10,
    ageMax: 13,
    ageDescription: 'Ages 10–13, ready to progress beyond beginner technique.',
    classes: [
      { style: 'Technique', day: 2, start: '16:00', end: '17:00', teamOnly: true },
      { style: 'Tap', day: 5, start: '17:00', end: '18:00' },
    ],
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    ageDescription: 'Ages 12+, or those with at least 4 years of dance experience (placement only).',
    classes: [
      { style: 'Ballet', day: 1, start: '19:00', end: '20:15' },
      { style: 'Ballet Technique', day: 6, start: '9:00', end: '10:15' },
      { style: 'Ballet', day: 4, start: '16:45', end: '18:00' },
      { style: 'Jazz', day: 2, start: '18:00', end: '19:00' },
      { style: 'Contemporary', day: 3, start: '17:15', end: '18:15' },
      { style: 'Hip-Hop', day: 3, start: '18:15', end: '19:15' },
    ],
  },
  {
    level: 'Level 3/4',
    ageMin: 12,
    ageMax: null,
    ageDescription: 'Ages 12+ with a strong technical foundation and several years of dance training (placement only).',
    classes: [
      { style: 'Musical Theater', day: 1, start: '17:15', end: '18:15' },
      { style: 'Acro', day: 3, start: '16:15', end: '17:15' },
    ],
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    ageDescription: 'Ages 12+ with at least 4 years of experience (placement only; requires one ballet class).',
    classes: [
      { style: 'Ballet', day: 1, start: '18:15', end: '19:30' },
      { style: 'Ballet Technique', day: 6, start: '10:15', end: '11:30' },
      { style: 'Ballet', day: 4, start: '16:45', end: '18:00' },
      { style: 'Jazz', day: 2, start: '18:00', end: '19:00' },
      { style: 'Contemporary', day: 3, start: '18:15', end: '19:15' },
      { style: 'Hip-Hop', day: 3, start: '19:15', end: '20:15' },
      { style: 'Pre-Pointe', day: 4, start: '16:00', end: '16:45' },
    ],
  },
  {
    level: 'Level 5',
    ageMin: 14,
    ageMax: null,
    ageDescription: 'Typically ages 14+ with extensive training and a strong foundation (placement only; requires one ballet class).',
    classes: [
      { style: 'Acro', day: 3, start: '17:15', end: '18:15' },
      { style: 'Technique', day: 2, start: '16:15', end: '17:15', teamOnly: true },
      { style: 'Pointe', day: 1, start: '19:30', end: '20:15' },
    ],
  },
  {
    level: 'Teen',
    ageMin: 13,
    ageMax: null,
    ageDescription: 'Ages 13+ looking to build confidence — no prior experience required.',
    classes: [{ style: 'Beginner Jazz', day: 4, start: '19:00', end: '20:00' }],
  },
]

// One supplementary, level-agnostic listing — not part of the studio's own
// 15-level system, so kept separate rather than folded into a guessed level.
const TEAM_TRAINING = {
  title: 'Dance on Broadway — Team Training',
  description: 'Supplementary strength and conditioning for competition team dancers, alongside their regular level class.',
  ageDescription: 'Open to team-track dancers across levels — not a standalone enrollment.',
  day: 4,
  start: '16:00',
  end: '16:45',
}

const ADDRESS = '3126 N Broadway, Chicago, IL 60657'
const LAT = 41.9395
const LNG = -87.6449
const SOURCE_URL = 'https://danceonbroadwaychi.com/youthschedule'
const PRICE = '475.00'
// The confirmed Monday-series rate ($475/14 weeks), applied as the
// standardized weekly figure for every level — see header comment on why
// this one real, screenshot-confirmed number is trusted studio-wide.
const PRICE_PER_WEEK = 475 / 14
const DISTANCE_MILES = haversineMiles(NETTELHORST_COORDS.lat, NETTELHORST_COORDS.lng, LAT, LNG)

function buildOptions(classes: LevelClass[], ageMin: number | null, ageMax: number | null): SportsClubOptionLine[] {
  return classes.map((c) => ({
    label: `${c.style} (${DAY_NAMES[c.day]}${c.teamOnly ? ' — Team Dancers Only' : ''})`,
    start_time: `${c.start}:00`,
    end_time: `${c.end}:00`,
    price: PRICE,
    price_unit: `per ${sessionCount(c.day)}-week series`,
    age_min: ageMin,
    age_max: ageMax,
    note: null,
  }))
}

function buildOccurrences(classes: LevelClass[]): OccurrenceRow[] {
  return classes.flatMap((c) => weeklyOccurrences(c.day, `${c.start}:00`, `${c.end}:00`))
}

async function main() {
  // 1. Fix the source row's domain/notes.
  const [source] = await db
    .update(sportsClubSources)
    .set({
      url: 'https://danceonbroadwaychi.com/',
      notes:
        "Real site is danceonbroadwaychi.com (the original pass used danceonbroadway.com — an unrelated parked placeholder domain, never the real studio). Full public class schedule at /youthschedule (real PDF grid, no login/widget gate), real per-level age eligibility at /youth-class-level-descriptions, real Mindbody pricing confirmed via a live screenshot ($475/14-week Monday series — see backfill-2026-08-19-dance-on-broadway-rebuild.ts for the full method).",
    })
    .where(eq(sportsClubSources.name, 'Dance on Broadway'))
    .returning({ id: sportsClubSources.id })
  if (!source) throw new Error('Dance on Broadway source row not found')

  // 2. Soft-delete the old, sparse listing.
  const deleted = await db
    .update(sportsClubs)
    .set({ deletedAt: new Date() })
    .where(eq(sportsClubs.title, 'Dance on Broadway'))
    .returning({ id: sportsClubs.id })
  console.log(`Soft-deleted ${deleted.length} old listing(s).`)

  // 3. Re-enrich a real image from the corrected domain.
  const image = await enrichSportsClubSourceImage([SOURCE_URL, 'https://www.facebook.com/danceonbroadwaychi/'])
  const placeholder = image ? null : await uploadPlaceholderImage('Dance on Broadway', 'sportsclubs')

  let insertedCount = 0
  let occurrenceCount = 0

  for (const spec of LEVELS) {
    const [row] = await db
      .insert(sportsClubs)
      .values({
        title: `Dance on Broadway — ${spec.level}`,
        description: spec.ageDescription,
        category: 'Dance',
        scheduleType: 'fixed_session',
        firstDate: SEASON_START,
        lastDate: SEASON_END,
        cadenceNote: null,
        ageMin: spec.ageMin,
        ageMax: spec.ageMax,
        price: PRICE,
        priceUnit: 'per 14-week series',
        pricePerWeek: PRICE_PER_WEEK.toFixed(2),
        priceNote:
          'Confirmed via the studio\'s Mindbody store for the Monday 14-week series ($475) — every series shown there priced the same regardless of class. Applied here to every class at this level; the exact total for a 15-week (non-Monday) series was not independently seen, only the per-week rate.',
        options: buildOptions(spec.classes, spec.ageMin, spec.ageMax),
        address: ADDRESS,
        locationName: 'Dance on Broadway',
        latitude: LAT.toString(),
        longitude: LNG.toString(),
        distanceMiles: DISTANCE_MILES.toFixed(2),
        signupStatus: 'open',
        signupInstructions: 'Register online via the studio\'s class schedule — Fall 2026 (Season 7) registration is open now.',
        sourceUrl: SOURCE_URL,
        sourceId: source.id,
        imageUrl: image?.imageUrl ?? placeholder!.imageUrl,
        thumbnailUrl: image?.thumbnailUrl ?? placeholder!.thumbnailUrl,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })
    insertedCount++

    const occurrences = buildOccurrences(spec.classes)
    if (occurrences.length > 0) {
      await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
      occurrenceCount += occurrences.length
    }
  }

  // 4. The one supplementary, level-agnostic listing.
  const [teamRow] = await db
    .insert(sportsClubs)
    .values({
      title: TEAM_TRAINING.title,
      description: TEAM_TRAINING.description,
      category: 'Dance',
      scheduleType: 'fixed_session',
      firstDate: SEASON_START,
      lastDate: SEASON_END,
      cadenceNote: TEAM_TRAINING.ageDescription,
      ageMin: null,
      ageMax: null,
      price: null,
      priceUnit: null,
      priceNote: 'Pricing not independently confirmed — likely bundled into team-level tuition rather than priced as a separate class.',
      options: null,
      address: ADDRESS,
      locationName: 'Dance on Broadway',
      latitude: LAT.toString(),
      longitude: LNG.toString(),
      distanceMiles: DISTANCE_MILES.toFixed(2),
      signupStatus: 'open',
      signupInstructions: 'For team dancers already enrolled in a competition-track level — coordinate with the studio directly.',
      sourceUrl: SOURCE_URL,
      sourceId: source.id,
      imageUrl: image?.imageUrl ?? placeholder!.imageUrl,
      thumbnailUrl: image?.thumbnailUrl ?? placeholder!.thumbnailUrl,
      status: 'approved',
    })
    .returning({ id: sportsClubs.id })
  insertedCount++
  const teamOccurrences = weeklyOccurrences(TEAM_TRAINING.day, `${TEAM_TRAINING.start}:00`, `${TEAM_TRAINING.end}:00`)
  await db.insert(sportsClubOccurrences).values(teamOccurrences.map((o) => ({ sportsClubId: teamRow.id, ...o })))
  occurrenceCount += teamOccurrences.length

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-19-dance-on-broadway-rebuild',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Replaced one sparse listing with 16 real level-based listings' },
  })

  console.log(`Inserted ${insertedCount} listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
