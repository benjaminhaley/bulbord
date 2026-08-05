import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog } from '../db/schema.js'
import { enrichCampSourceImage } from './image-enrichment.js'

// One-off, rerunnable cleanup script — re-run a second time (2026-08-05,
// same day) after a follow-up round of feedback on a rendered screenshot
// found more issues than the first pass fixed. Both passes apply corrected
// text/data to camp rows already live in the database, mirroring whatever
// the current ProviderSpec/backfill-2026-08-05-unicoi.ts source constants
// say — see those files' own house-style doc comments for the template.
//
// First pass: description was repeating the age range already shown in the
// stat line, and price_details was one dense run-on paragraph instead of a
// scannable line per tier. Unicoi's image was also missing entirely —
// enrichCampSourceImage was only given their Facebook page (no usable
// og:image there); fixed by making it accept multiple candidate pages.
//
// Second pass (feedback, 2026-08-05): (1) description was ALSO repeating
// the venue name (already the page's own title) — trimmed further.
// (2) price_details lines mixed colons/parens/commas inconsistently
// ("haphazard") — reformatted to reuse the stat line's own "Label: value
// · Label: value" convention. (3) The section heading itself was renamed
// "Pricing" -> "Options" (a code change, not data — see CampDetailPage.tsx).
// (4) Unicoi's age_min/age_max were the union of its two sessions (4-13);
// corrected to 5-12, the range that actually qualifies for the full
// bridged day (the intersection of Morning's 5-13 and Afternoon's 4-12) —
// the wider per-session ranges stay visible in the Options breakdown.
//
// Third pass (feedback, 2026-08-05): prep_instructions rewritten the same
// one-item-per-line way as price_details — "can you make what to bring a
// bulleted list... bullet, the item, and then, optionally, a description
// of the item... set apart from the description" — CampDetailPage.tsx's
// LabeledBulletList bolds everything before the first colon on each line.
interface TextUpdate {
  sourceName: string
  description: string
  priceDetails?: string
  ageMin?: number
  ageMax?: number | null
  prepInstructions?: string
}

const TEXT_UPDATES: TextUpdate[] = [
  {
    sourceName: 'Lake View YMCA',
    description: '"School Days Out" — a full day of activities while school is out.',
    prepInstructions: [
      'Lunch',
      'Water bottle: no glass',
      'Swimsuit and towel: if the day includes pool time',
      'Comfortable clothes for active play',
    ].join('\n'),
  },
  {
    sourceName: 'ClimbZone Chicago',
    description: 'Full-day camp — climbing walls, high ropes, laser tag, and arts and crafts.',
    priceDetails: [
      'Full day: 9:00 AM – 3:30 PM · $120/day ($540/week)',
      'Full day + aftercare: 9:00 AM – 5:30 PM · $150/day total',
      'Morning half-day: 9:00 AM – 12:00 PM · $70/day ($320/week)',
      'Afternoon half-day: 12:30 PM – 3:30 PM · $70/day ($320/week)',
      '5% sibling discount applies to camp fees',
    ].join('\n'),
    prepInstructions: [
      'Sneakers or gym shoes',
      'Grip socks: required in the soft-play area — bring your own or buy a pair on-site',
      'Lunch: or pre-order one from ClimbZone for $10/child',
    ].join('\n'),
  },
  {
    sourceName: 'Fit City Kids',
    description: `"School's Out Camp" — fitness classes and active play.`,
    priceDetails: [
      'Day camp: 8:00 AM – 3:00 PM · $85/day',
      'Full day + after-camp extension: 8:00 AM – 6:00 PM · $120/day total',
      'Both options available for any date',
    ].join('\n'),
    prepInstructions: ['Gym shoes and socks', 'Labeled water bottle', 'Snack and lunch'].join('\n'),
  },
  {
    sourceName: 'BitSpace',
    description: '"Day Off Camp" — design thinking, 3D printing, woodworking, and programmable electronics.',
    priceDetails: ['Full day · Ages 8+ · $150/day', 'Half-day · Ages 7-12 · price not yet published'].join('\n'),
    prepInstructions: [
      'Nut-free sack lunch, snacks, and a water bottle',
      'Closed-toe shoes: no open-toed shoes or crocs',
      'Hair tie: for long hair',
      'Clothes that can get messy: no loose jewelry or loose clothing — some days get messy',
      'Phone: fine for emergencies but must stay zipped in the backpack',
    ].join('\n'),
  },
  {
    sourceName: 'Family Room Chicago (Broadway)',
    description:
      '"Day Camp: Single-Day Drop-In Pass" at the Broadway Clubhouse Suite — up to 9 hours of supervised sports, free play, and creative activities with a 10:1 camper-to-staff ratio.',
    priceDetails: [
      'Express Pass: 3 hours · $45/day',
      'Half-Day Pass: 5 hours · $65/day',
      'Full-Day Pass: 9 hours · $95/day (shown above)',
      'All three lengths available for any date',
    ].join('\n'),
  },
  {
    sourceName: 'Chicago Park District — Gill Park',
    description: 'Recreational activities, arts and crafts, and sports at the Gill Park fieldhouse.',
    prepInstructions: [
      'Backpack',
      'Change of clothes: if needed',
      'Water bottle',
      'Sunscreen: apply before arrival',
      'A free lunch and snack are provided district-wide, though kids are welcome to bring their own',
    ].join('\n'),
  },
  {
    sourceName: 'Unicoi Art Studio',
    description: 'Free play, structured art projects, and (weather permitting) park time.',
    priceDetails: [
      'Morning: 9:00 AM – 1:00 PM · $65/day · Ages 5-13',
      'Afternoon: 1:30 PM – 5:00 PM · $55/day · Ages 4-12',
      'Full day (register both): 9:00 AM – 5:00 PM · $120/day',
      'Weekly rates also available (vary by camp series)',
    ].join('\n'),
    ageMin: 5,
    ageMax: 12,
    prepInstructions: [
      'Labeled lunch',
      'Water bottle',
      'Clothes that can get messy: art projects can get messy — dress for it or bring a smock/old shirt',
      'Weather permitting, campers walk to nearby Hamlin Park for outdoor time',
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
    if (update.ageMin !== undefined) setValues.ageMin = update.ageMin
    if (update.ageMax !== undefined) setValues.ageMax = update.ageMax
    if (update.prepInstructions !== undefined) setValues.prepInstructions = update.prepInstructions

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

  const [existing] = await db
    .select({ imageUrl: camps.imageUrl })
    .from(camps)
    .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
    .limit(1)
  if (existing?.imageUrl) {
    console.log('Unicoi Art Studio: already has an image — skipping re-enrichment')
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
