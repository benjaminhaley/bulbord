import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs } from '../db/schema.js'

// Feedback #107 (2026-08-19): "let's just make this three separate listings
// one for each schedule. Please apply that to this case and all cases."
// Continuing backfill-2026-08-19-split-dance-on-broadway-classes.ts's split
// to the three other sports_clubs listings whose options carry real,
// distinct per-option start/end times bundled under one row — the same
// root cause as feedback #106's filter bug (matchesScheduleFilter can only
// check a listing's own single soonest occurrence, so a listing meeting on
// several different days/times can never correctly match a specific-day
// filter). Each split-off listing keeps its parent's price/signup/source
// fields (none of these three providers publish a genuinely different
// price per tier) and gets its own accurate occurrence rows instead of the
// parent's one representative cadence.

const TODAY = new Date()
const ONGOING_WINDOW_WEEKS = 12

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OccurrenceRow {
  date: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

function rollingWeeklyOccurrences(daysOfWeek: number[], startTime: string, endTime: string): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${toDateString(TODAY)}T00:00:00Z`)
  const end = new Date(`${toDateString(addWeeks(TODAY, ONGOING_WINDOW_WEEKS))}T00:00:00Z`)
  while (cursor <= end) {
    if (daysOfWeek.includes(cursor.getUTCDay())) {
      rows.push({ date: toDateString(cursor), startTime, endTime, note: null })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

interface SplitSection {
  titleSuffix: string
  cadenceNote: string
  ageMin: number | null
  ageMax: number | null
  daysOfWeek: number[]
  startTime: string
  endTime: string
}

interface SplitSpec {
  parentTitle: string
  baseTitle: string
  sections: SplitSection[]
}

const SPECS: SplitSpec[] = [
  {
    parentTitle: 'Uniting Voices Chicago',
    baseTitle: 'Uniting Voices Chicago',
    sections: [
      {
        titleSuffix: 'Allegro',
        cadenceNote: 'Tuesdays & Thursdays, 4:45–5:45pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [2, 4],
        startTime: '16:45:00',
        endTime: '17:45:00',
      },
      {
        titleSuffix: 'Vivace',
        cadenceNote: 'Tuesdays & Thursdays, 5:45–6:45pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [2, 4],
        startTime: '17:45:00',
        endTime: '18:45:00',
      },
      {
        titleSuffix: 'Presto',
        cadenceNote: 'Tuesdays & Thursdays, 6:45–7:45pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [2, 4],
        startTime: '18:45:00',
        endTime: '19:45:00',
      },
    ],
  },
  {
    parentTitle: 'Thousand Waves — Kids Karate (Seido)',
    baseTitle: 'Thousand Waves',
    sections: [
      {
        titleSuffix: 'Juniors (age 5–2nd grade)',
        cadenceNote: 'Tuesdays, 4:15–5pm — sample schedule shown; full weekly schedule at the studio\'s own site.',
        ageMin: 5,
        ageMax: 7,
        daysOfWeek: [2],
        startTime: '16:15:00',
        endTime: '17:00:00',
      },
      {
        titleSuffix: 'Youth & Teens (3rd grade–14)',
        cadenceNote: 'Tuesdays, 5–6pm — sample schedule shown; full weekly schedule at the studio\'s own site.',
        ageMin: 8,
        ageMax: 14,
        daysOfWeek: [2],
        startTime: '17:00:00',
        endTime: '18:00:00',
      },
    ],
  },
  {
    parentTitle: 'Japan Karate Association of Chicago — Kids Karate',
    baseTitle: 'Japan Karate Association of Chicago',
    sections: [
      {
        titleSuffix: 'Beginner (Mon & Wed)',
        cadenceNote: 'Mondays & Wednesdays, 5–5:30pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [1, 3],
        startTime: '17:00:00',
        endTime: '17:30:00',
      },
      {
        titleSuffix: 'Intermediate/Advanced (Mon & Wed)',
        cadenceNote: 'Mondays & Wednesdays, 5:30–6:30pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [1, 3],
        startTime: '17:30:00',
        endTime: '18:30:00',
      },
      {
        titleSuffix: 'Intermediate/Advanced (Tue)',
        cadenceNote: 'Tuesdays, noon–1pm.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [2],
        startTime: '12:00:00',
        endTime: '13:00:00',
      },
      {
        titleSuffix: 'Intermediate/Advanced (Sat)',
        cadenceNote: 'Saturdays, 9–10am.',
        ageMin: null,
        ageMax: null,
        daysOfWeek: [6],
        startTime: '09:00:00',
        endTime: '10:00:00',
      },
    ],
  },
]

async function main() {
  let totalInserted = 0
  let totalOccurrences = 0

  for (const spec of SPECS) {
    const [parent] = await db.select().from(sportsClubs).where(eq(sportsClubs.title, spec.parentTitle)).limit(1)
    if (!parent) {
      console.warn(`No row found for "${spec.parentTitle}" — skipping.`)
      continue
    }

    await db.update(sportsClubs).set({ deletedAt: new Date() }).where(eq(sportsClubs.id, parent.id))

    for (const section of spec.sections) {
      const [row] = await db
        .insert(sportsClubs)
        .values({
          title: `${spec.baseTitle} — ${section.titleSuffix}`,
          description: parent.description,
          category: parent.category,
          scheduleType: parent.scheduleType,
          firstDate: parent.firstDate,
          lastDate: parent.lastDate,
          cadenceNote: section.cadenceNote,
          ageMin: section.ageMin ?? parent.ageMin,
          ageMax: section.ageMax ?? parent.ageMax,
          price: parent.price,
          priceUnit: parent.priceUnit,
          pricePerWeek: parent.pricePerWeek,
          priceNote: parent.priceNote,
          options: null,
          address: parent.address,
          locationName: parent.locationName,
          latitude: parent.latitude,
          longitude: parent.longitude,
          distanceMiles: parent.distanceMiles,
          signupStatus: parent.signupStatus,
          signupInstructions: parent.signupInstructions,
          sourceUrl: parent.sourceUrl,
          sourceId: parent.sourceId,
          imageUrl: parent.imageUrl,
          thumbnailUrl: parent.thumbnailUrl,
          status: 'approved',
        })
        .returning({ id: sportsClubs.id })
      totalInserted++

      const occurrences = rollingWeeklyOccurrences(section.daysOfWeek, section.startTime, section.endTime)
      if (occurrences.length > 0) {
        await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
        totalOccurrences += occurrences.length
      }
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-19-split-multi-schedule-clubs',
    action: 'sports_club_created',
    metadata: { totalInserted, totalOccurrences, note: 'Split Uniting Voices/Thousand Waves/Japan Karate into one listing per real schedule (feedback #107)' },
  })

  console.log(`Inserted ${totalInserted} listings and ${totalOccurrences} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
