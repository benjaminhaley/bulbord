import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog, type CampOptionLine } from '../db/schema.js'

// One-off, rerunnable backfill for the "structured Options/What-to-bring"
// migration (feedback: "we don't want it to be free text... much better if
// it's structured fields... consistently displayed"). price_details/
// prep_instructions were dropped as free-text columns in favor of options/
// prep_items (JSONB CampOptionLine[] — see db/schema.ts) in the same
// migration that added them, so this script re-applies the exact same
// content already hand-authored in seed-2026-08-04-providers.ts and
// backfill-2026-08-05-unicoi.ts to the camp rows that already exist in the
// database (both scripts' own inserts happened before this migration
// existed, so those rows still need their new columns populated). Not
// derived by parsing the old text — hand-copied from the same source-of-
// truth constants, to avoid any risk of a parsing bug silently mangling
// data that was already correct.
interface StructuredUpdate {
  sourceName: string
  options?: CampOptionLine[]
  prepItems: CampOptionLine[]
}

const UPDATES: StructuredUpdate[] = [
  {
    sourceName: 'Lake View YMCA',
    prepItems: [
      { label: 'Food and drink', detail: 'a lunch and a water bottle (no glass)' },
      { label: 'Swimsuit and towel', detail: 'if the day includes pool time' },
      { label: 'Comfortable clothes', detail: 'for active play' },
    ],
  },
  {
    sourceName: 'ClimbZone Chicago',
    options: [
      { label: 'Full day', detail: '9:00 AM – 3:30 PM · $120/day ($540/week)' },
      { label: 'Full day + aftercare', detail: '9:00 AM – 5:30 PM · $150/day total' },
      { label: 'Morning half-day', detail: '9:00 AM – 12:00 PM · $70/day ($320/week)' },
      { label: 'Afternoon half-day', detail: '12:30 PM – 3:30 PM · $70/day ($320/week)' },
      { label: 'Sibling discount', detail: '5% off camp fees' },
    ],
    prepItems: [
      { label: 'Footwear', detail: 'sneakers or gym shoes' },
      { label: 'Grip socks', detail: 'required in the soft-play area — bring your own or buy a pair on-site' },
      { label: 'Lunch', detail: 'or pre-order one from ClimbZone for $10/child' },
    ],
  },
  {
    sourceName: 'Fit City Kids',
    options: [
      { label: 'Day camp', detail: '8:00 AM – 3:00 PM · $85/day' },
      { label: 'Full day + after-camp extension', detail: '8:00 AM – 6:00 PM · $120/day total' },
    ],
    prepItems: [
      { label: 'Footwear', detail: 'gym shoes and socks' },
      { label: 'Food and drink', detail: 'a labeled water bottle, a snack, and a lunch' },
    ],
  },
  {
    sourceName: 'BitSpace',
    options: [
      { label: 'Full day', detail: 'Ages 8+ · $150/day' },
      { label: 'Half-day', detail: 'Ages 7-12 · price not yet published' },
    ],
    prepItems: [
      { label: 'Food and drink', detail: 'a nut-free sack lunch, snacks, and a water bottle' },
      { label: 'Closed-toe shoes', detail: 'no open-toed shoes or crocs' },
      { label: 'Hair tie', detail: 'for long hair' },
      { label: 'Clothes that can get messy', detail: 'no loose jewelry or loose clothing — some days get messy' },
      { label: 'Phone', detail: 'fine for emergencies but must stay zipped in the backpack' },
    ],
  },
  {
    sourceName: 'Chicago Park District — Gill Park',
    prepItems: [
      { label: 'Bring', detail: 'a backpack and a water bottle' },
      { label: 'Change of clothes', detail: 'if needed' },
      { label: 'Sunscreen', detail: 'apply before arrival' },
      { label: 'Food', detail: 'a free lunch and snack are provided district-wide, though kids are welcome to bring their own' },
    ],
  },
  {
    sourceName: 'Family Room Chicago (Broadway)',
    options: [
      { label: 'Express Pass', detail: '3 hours · $45/day' },
      { label: 'Half-Day Pass', detail: '5 hours · $65/day' },
      { label: 'Full-Day Pass', detail: '9 hours · $95/day (shown above)' },
    ],
    prepItems: [{ label: 'Nothing to pack', detail: 'healthy snacks and a whole-food lunch are included for the day.' }],
  },
  {
    sourceName: 'Unicoi Art Studio',
    options: [
      { label: 'Morning', detail: '9:00 AM – 1:00 PM · $65/day · Ages 5-13' },
      { label: 'Afternoon', detail: '1:30 PM – 5:00 PM · $55/day · Ages 4-12' },
      { label: 'Full day (register both)', detail: '9:00 AM – 5:00 PM · $120/day' },
      { label: 'Weekly rates', detail: 'also available (vary by camp series)' },
    ],
    prepItems: [
      { label: 'Food and drink', detail: 'a labeled lunch and a water bottle' },
      { label: 'Clothes that can get messy', detail: 'for art projects and, weather permitting, a walk to nearby Hamlin Park' },
    ],
  },
]

async function main() {
  let totalUpdated = 0
  for (const update of UPDATES) {
    const [source] = await db
      .select({ id: campSources.id })
      .from(campSources)
      .where(and(eq(campSources.name, update.sourceName), isNull(campSources.deletedAt)))
      .limit(1)
    if (!source) {
      console.log(`No camp_sources row found for "${update.sourceName}" — skipping`)
      continue
    }

    const updatedRows = await db
      .update(camps)
      .set({ options: update.options ?? null, prepItems: update.prepItems, updatedAt: new Date() })
      .where(and(eq(camps.sourceId, source.id), isNull(camps.deletedAt)))
      .returning({ id: camps.id })

    console.log(`${update.sourceName}: updated ${updatedRows.length} camp(s)`)
    totalUpdated += updatedRows.length
  }

  await db.insert(eventsLog).values({
    actor: 'claude:camps-structured-options-2026-08-05',
    action: 'camps_structured_options_backfill',
    metadata: { updatedCount: totalUpdated },
  })

  console.log(`Done. ${totalUpdated} camp(s) updated total.`)
}

await main()
process.exit(0)
