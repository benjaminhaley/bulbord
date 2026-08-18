import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { sportsClubs } from '../db/schema.js'

// Feedback (2026-08-18): titles shouldn't carry location text ("Basketball
// at Gill Park", "i9 Sports — Waveland Lakeshore Fields", "...Lincoln Park
// Neighborhood Choir") — same convention Camps already established
// ("Titles are just the provider/venue name... redundant, since [the venue]
// is already shown" — see CLAUDE.md's Camps section) applied here: a real
// venue/location name belongs in location_name, shown as its own line below
// the title (web/src/sports-clubs/SportsClubDetailPage.tsx already renders
// it there), not folded into the title text. Genuinely non-location
// descriptors — a real program name (Wiggleworms, Rock 101, Bully Proof),
// a class type (Handbuilding, Boys Gymnastics Level 1), a discipline
// (Seido) — are kept, since those aren't the thing being asked to move.

interface TitleUpdate {
  oldTitle: string
  newTitle: string
  locationName: string | null
}

const TITLE_UPDATES: TitleUpdate[] = [
  { oldTitle: 'Dance on Broadway — Youth Program', newTitle: 'Dance on Broadway', locationName: null },
  { oldTitle: 'Tutu School — Ballet Classes', newTitle: 'Tutu School', locationName: null },
  { oldTitle: 'Dovetail Studios — Youth Dance', newTitle: 'Dovetail Studios', locationName: null },
  { oldTitle: 'A Fairytale Ballet — Academy Program', newTitle: 'A Fairytale Ballet', locationName: null },
  { oldTitle: 'Uniting Voices Chicago — Lincoln Park Neighborhood Choir', newTitle: 'Uniting Voices Chicago', locationName: 'Holtschneider Performance Center' },
  { oldTitle: 'Kidcreate Studio — Art Academy', newTitle: 'Kidcreate Studio', locationName: null },
  { oldTitle: 'Unicoi Art Studio — Weekly Art Classes', newTitle: 'Unicoi Art Studio', locationName: null },
  { oldTitle: 'Chicago Park District — T-ball', newTitle: 'Chicago Park District — T-ball', locationName: 'Gill Park' },
  { oldTitle: 'Chicago Park District — Basketball at Gill Park', newTitle: 'Chicago Park District — Basketball', locationName: 'Gill Park' },
  { oldTitle: 'Chicago Park District — Soccer at Hamlin Park', newTitle: 'Chicago Park District — Soccer', locationName: 'Hamlin Park' },
  {
    oldTitle: 'Chicago Park District — Boys Gymnastics Level 1 (Broadway Armory)',
    newTitle: 'Chicago Park District — Boys Gymnastics Level 1',
    locationName: 'Broadway Armory',
  },
  { oldTitle: 'i9 Sports — Waveland Lakeshore Fields', newTitle: 'i9 Sports', locationName: 'Waveland Lakeshore Fields' },
  {
    oldTitle: 'Lil Sluggers Chicago — Lil League (T-Ball & Coach-Pitch)',
    newTitle: 'Lil Sluggers Chicago — Lil League (T-Ball & Coach-Pitch)',
    locationName: 'Blaine Elementary Field',
  },
]

async function main() {
  for (const update of TITLE_UPDATES) {
    const result = await db
      .update(sportsClubs)
      .set({ title: update.newTitle, locationName: update.locationName })
      .where(eq(sportsClubs.title, update.oldTitle))
      .returning({ id: sportsClubs.id })
    console.log(`${update.oldTitle} -> ${update.newTitle}: ${result.length} row(s) updated`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
