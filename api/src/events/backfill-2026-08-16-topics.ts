// One-off (feedback #97): retroactively tags every already-approved event
// with a topic from the fixed picker (web/src/events/topics.ts), by hand
// judgment against each real title/description — same "reviewed, not
// invented" posture as other retroactive-classification backfills in this
// codebase (e.g. events/backfill-2026-08-02-simplify-titles.ts). Matches by
// exact title (several real titles recur across many rows — "Block Party",
// "Green City Market", "Movies in the Parks: ..." — one UPDATE per title
// covers every occurrence). A title not in this map is left untagged
// (topic stays null) rather than defaulted to "Other" — an unclassified
// event is a different, honest state from a deliberate "Other" choice.
import 'dotenv/config'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { events } from '../db/schema.js'

const TITLE_TOPIC_MAP: Record<string, string> = {
  'Halloween Window Painting': 'Arts & Crafts',
  'Lakeview East Festival of the Arts': 'Arts & Crafts',
  'Low-Line Market at Southport': 'Community & Social',
  'Clark Street Live': 'Community & Social',
  'Lakeview East Kidical Mass': 'Sports & Fitness',
  'Nettelhorst French Market': 'Community & Social',
  'Baby Time': 'Community & Social',
  'Casting on the Pier': 'Sports & Fitness',
  'Northalsted Market Days': 'Community & Social',
  'Wrigleyville Night Market': 'Community & Social',
  'Dine Out on Broadway': 'Community & Social',
  'Lakeview Taco Fest': 'Community & Social',
  'Movie Night: High School Musical': 'Movie Night',
  'Southport Neighbors Yard Sale': 'Community & Social',
  'Movie Night: Happy Gilmore': 'Movie Night',
  'Sunday Crafternoon': 'Arts & Crafts',
  'Transilience: Chicago Trans Pride Festival at Gill': 'Community & Social',
  'Movies in the Parks: Bohemian Rhapsody': 'Movie Night',
  'Youth Cicada Pinning Workshop': 'Other',
  'Green City Market': 'Community & Social',
  'Southport Neighbors Meeting': 'Community & Social',
  'Art in the Garden': 'Arts & Crafts',
  'Back to School Bash': 'Community & Social',
  'SEED Cohort Open House': 'Other',
  'Indoor Kids: Jason and the Argonauts': 'Movie Night',
  'New Family Meet and Greet': 'Community & Social',
  'Indoor Kids: The Secret World of Arrietty': 'Movie Night',
  'Indoor Kids: Hercules': 'Movie Night',
  'Block Party': 'Community & Social',
  'Keep Families in the City! Building Neighborhoods for Lifelong Chicagoans': 'Other',
  'Craft Supply Swap': 'Arts & Crafts',
  'Back to School Clothing Swap': 'Community & Social',
  'Film Screening: Cinderella (1950)': 'Movie Night',
  'Oktoberfest Chicago': 'Community & Social',
  'Fall Fest at Lincoln Park Zoo': 'Community & Social',
  'Sensory Friendly Morning': 'Other',
  'Movies in the Parks: Star Wars: A New Hope': 'Movie Night',
  'Movies in the Parks: The Wizard of Oz': 'Movie Night',
  'Movie Night: National Treasure': 'Movie Night',
  'Movie Night: How to Lose a Guy in 10 Days': 'Movie Night',
}

async function main() {
  let totalUpdated = 0
  for (const [title, topic] of Object.entries(TITLE_TOPIC_MAP)) {
    const updated = await db
      .update(events)
      .set({ topic, updatedAt: new Date() })
      .where(and(eq(events.title, title), isNull(events.deletedAt), isNull(events.topic)))
      .returning({ id: events.id })
    if (updated.length > 0) {
      console.log(`  ${title} -> ${topic} (${updated.length} row(s))`)
      totalUpdated += updated.length
    }
  }
  console.log(`Done. ${totalUpdated} event row(s) tagged.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
