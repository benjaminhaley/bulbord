import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog } from '../db/schema.js'
import { enrichCampSourceImage } from './image-enrichment.js'

// One-off, rerunnable cleanup applying two fixes found from a real rendered
// screenshot of Unicoi Art Studio's live detail page (feedback, 2026-08-05):
// (1) description text was repeating the age range already shown in the
// always-visible stat line ("Ages: 4-13" in the line above, then "Ages
// 4-13." again in the description below it), and price_details was one
// dense run-on paragraph instead of a scannable line per tier — both fixed
// at the source in seed-2026-08-04-providers.ts's ProviderSpec entries and
// backfill-2026-08-05-unicoi.ts's constants (see each file's own house-style
// doc comments for the template this follows); this script re-applies that
// corrected text to the camp rows already live in the database, the same
// "fix the seed source AND backfill existing rows" split
// backfill-2026-08-05-times.ts already established. (2) Unicoi's image was
// missing entirely — enrichCampSourceImage was only given their Facebook
// page, which turned out to have no usable og:image; now that it accepts
// multiple candidate pages (see image-enrichment.ts), this re-runs
// enrichment against unicoistudio.com/about-us/ first (a real WordPress
// photo lives there) with Facebook still as a fallback.
interface TextUpdate {
  sourceName: string
  description: string
  priceDetails?: string
}

const TEXT_UPDATES: TextUpdate[] = [
  {
    sourceName: 'Lake View YMCA',
    description: 'Lake View YMCA "School Days Out" — full day of activities while school is out.',
  },
  {
    sourceName: 'ClimbZone Chicago',
    description: 'ClimbZone Chicago full-day camp — climbing walls, high ropes, laser tag, and arts and crafts.',
    priceDetails: [
      'Full day (9:00am-3:30pm): $120/day, $540/week.',
      'Add aftercare (3:30-5:30pm) for the full 9:00am-5:30pm day: $150/day total.',
      'Morning half-day (9:00am-12:00pm): $70/day, $320/week.',
      'Afternoon half-day (12:30pm-3:30pm): $70/day, $320/week.',
      '5% sibling discount applies to camp fees.',
    ].join('\n'),
  },
  {
    sourceName: 'Fit City Kids',
    description: `Fit City Kids "School's Out Camp" — fitness classes and active play.`,
    priceDetails: [
      '8am-3pm day camp: $85/day.',
      'Add the 3pm-6pm after-camp extension for the full 8am-6pm day: $120/day total.',
      'Both options available for any date.',
    ].join('\n'),
  },
  {
    sourceName: 'BitSpace',
    description: 'BitSpace "Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics.',
    priceDetails: ['Full day (ages 8+): $150/day.', 'Half-day option (ages 7-12): price not yet published.'].join('\n'),
  },
  {
    sourceName: 'Family Room Chicago (Broadway)',
    description:
      'Family Room Chicago — Broadway Clubhouse Suite. "Day Camp: Single-Day Drop-In Pass" — up to 9 hours of supervised sports, free play, and creative activities with a 10:1 camper-to-staff ratio.',
    priceDetails: [
      '3-hour Express Pass: $45/day.',
      '5-hour Half-Day Pass: $65/day.',
      '9-hour Full-Day Pass: $95/day (shown above).',
      'All three lengths available for any date.',
    ].join('\n'),
  },
  {
    sourceName: 'Unicoi Art Studio',
    description: 'Unicoi Art Studio — free play, structured art projects, and (weather permitting) park time.',
    priceDetails: [
      'Morning (9:00am-1:00pm, ages 5-13): $65/day.',
      'Afternoon (1:30pm-5:00pm, ages 4-12): $55/day.',
      "Register both for the studio's own bridged full day, 9:00am-5:00pm: $120/day total (shown above).",
      'Weekly rates also available (vary by camp series).',
    ].join('\n'),
  },
]

async function updateText() {
  let totalUpdated = 0
  for (const update of TEXT_UPDATES) {
    const [source] = await db
      .select({ id: campSources.id })
      .from(campSources)
      .where(and(eq(campSources.name, update.sourceName), isNull(campSources.deletedAt)))
      .limit(1)
    if (!source) {
      console.log(`No camp_sources row found for "${update.sourceName}" — skipping`)
      continue
    }

    const setValues: Partial<typeof camps.$inferInsert> = { description: update.description, updatedAt: new Date() }
    if (update.priceDetails !== undefined) setValues.priceDetails = update.priceDetails

    const updatedRows = await db
      .update(camps)
      .set(setValues)
      .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
      .returning({ id: camps.id })

    console.log(`${update.sourceName}: text updated on ${updatedRows.length} camp(s)`)
    totalUpdated += updatedRows.length
  }
  return totalUpdated
}

async function fixUnicoiImage() {
  const [source] = await db
    .select({ id: campSources.id })
    .from(campSources)
    .where(and(eq(campSources.name, 'Unicoi Art Studio'), isNull(campSources.deletedAt)))
    .limit(1)
  if (!source) {
    console.log('No camp_sources row found for "Unicoi Art Studio" — skipping image fix')
    return 0
  }

  const image = await enrichCampSourceImage(['http://www.unicoistudio.com/about-us/', 'https://www.facebook.com/UnicoiStudio/'])
  if (!image) {
    console.log('Unicoi Art Studio: still no usable image found')
    return 0
  }

  const updatedRows = await db
    .update(camps)
    .set({ imageUrl: image.imageUrl, thumbnailUrl: image.thumbnailUrl, updatedAt: new Date() })
    .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
    .returning({ id: camps.id })

  console.log(`Unicoi Art Studio: image set on ${updatedRows.length} camp(s)`)
  return updatedRows.length
}

async function main() {
  const textUpdated = await updateText()
  const imageUpdated = await fixUnicoiImage()

  await db.insert(eventsLog).values({
    actor: 'claude:camps-cleanup-2026-08-05',
    action: 'camps_text_and_image_cleanup',
    metadata: { textUpdated, imageUpdated },
  })

  console.log(`Done. ${textUpdated} camp(s) had text updated, ${imageUpdated} camp(s) got Unicoi's image.`)
}

await main()
process.exit(0)
