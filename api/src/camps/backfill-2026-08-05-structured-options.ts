import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, camps, eventsLog, type CampOptionLine, type CampPrepLine } from '../db/schema.js'

// One-off, rerunnable backfill for the "structured Options/What-to-bring"
// migration (feedback: "we don't want it to be free text... much better if
// it's structured fields... consistently displayed"). price_details/
// prep_instructions were dropped as free-text columns in favor of options/
// prep_items (JSONB — see db/schema.ts) in the same migration that added
// them, so this script re-applies the exact same content already hand-
// authored in seed-2026-08-04-providers.ts and backfill-2026-08-05-unicoi.ts
// to the camp rows that already exist in the database (both scripts' own
// inserts happened before this migration existed, so those rows still need
// their new columns populated). Not derived by parsing the old text —
// hand-copied from the same source-of-truth constants, to avoid any risk of
// a parsing bug silently mangling data that was already correct.
//
// Updated 2026-08-05 (same day, later pass — "every option should include
// an age range, a time, and a price... consistent structured fields") to
// carry CampOptionLine's later per-field time/age/price shape instead of
// the original label+detail string, and to add a synthetic single-row
// options table for Lake View YMCA (a flat rate, no real tiers, but still
// needs a table row now that the detail page's top summary hides
// price/age/time once any options exist — see CampDetailPage.tsx).
interface StructuredUpdate {
  sourceName: string
  options?: CampOptionLine[]
  prepItems: CampPrepLine[]
}

const UPDATES: StructuredUpdate[] = [
  {
    sourceName: 'Lake View YMCA',
    options: [{ label: 'Full day', start_time: '07:00', end_time: '18:00', price: '70.00', age_min: null, age_max: null, note: null }],
    prepItems: [
      { label: 'Food and drink', detail: 'a lunch and a water bottle (no glass)' },
      { label: 'Swimsuit and towel', detail: 'if the day includes pool time' },
      { label: 'Comfortable clothes', detail: 'for active play' },
    ],
  },
  {
    sourceName: 'ClimbZone Chicago',
    options: [
      { label: 'Full day', start_time: '09:00', end_time: '15:30', price: '120.00', age_min: null, age_max: null, note: '$540/week' },
      { label: 'Full day + aftercare', start_time: '09:00', end_time: '17:30', price: '150.00', age_min: null, age_max: null, note: null },
      { label: 'Morning half-day', start_time: '09:00', end_time: '12:00', price: '70.00', age_min: null, age_max: null, note: '$320/week' },
      { label: 'Afternoon half-day', start_time: '12:30', end_time: '15:30', price: '70.00', age_min: null, age_max: null, note: '$320/week' },
      { label: 'Sibling discount', start_time: null, end_time: null, price: null, age_min: null, age_max: null, note: '5% off camp fees' },
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
    prepItems: [
      { label: 'Footwear', detail: 'gym shoes and socks' },
      { label: 'Food and drink', detail: 'a labeled water bottle, a snack, and a lunch' },
    ],
  },
  {
    sourceName: 'BitSpace',
    options: [
      { label: 'Full day', start_time: null, end_time: null, price: '150.00', age_min: null, age_max: null, note: null },
      { label: 'Half-day', start_time: null, end_time: null, price: null, age_min: 7, age_max: 12, note: null },
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
      { label: 'Express Pass', start_time: null, end_time: null, price: '45.00', age_min: null, age_max: null, note: '3 hours' },
      { label: 'Half-Day Pass', start_time: null, end_time: null, price: '65.00', age_min: null, age_max: null, note: '5 hours' },
      { label: 'Full-Day Pass', start_time: null, end_time: null, price: '95.00', age_min: null, age_max: null, note: '9 hours' },
    ],
    prepItems: [{ label: 'Nothing to pack', detail: 'healthy snacks and a whole-food lunch are included for the day.' }],
  },
  {
    sourceName: 'Unicoi Art Studio',
    options: [
      { label: 'Morning', start_time: '09:00', end_time: '13:00', price: '65.00', age_min: 5, age_max: 13, note: null },
      { label: 'Afternoon', start_time: '13:30', end_time: '17:00', price: '55.00', age_min: 4, age_max: 12, note: null },
      {
        label: 'Full day (register both)',
        start_time: '09:00',
        end_time: '17:00',
        price: '120.00',
        age_min: null,
        age_max: null,
        note: null,
      },
      { label: 'Weekly rates', start_time: null, end_time: null, price: null, age_min: null, age_max: null, note: 'vary by camp series' },
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
