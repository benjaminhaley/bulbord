import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Follow-up to fix-2026-09-04-northalsted-shared-image.ts: the automated web
// image search (searchWebImage) found real, appropriate replacements for
// some of the affected events but not others — either it came up empty
// (Commons' own search ranking is patchy for some phrasings) or, in "A Night
// of Wellness"'s case, it found a real photo that passed the quality gate
// but was completely wrong (a 1920s spa/bathhouse architectural blueprint,
// not a photo of a wellness experience) — a reminder that a quality-gate
// pass is not proof of relevance, so every automated pick still needs a
// human look before being trusted. Each URL below was found via a manual
// Commons search and visually verified before use.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: '1151b890-fccc-4342-bfeb-c74f8b35581f', // A Craft Series September: Jeanius
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Pottery_workshop_at_Odisha_Crafts_Museum_08.jpg',
  },
  {
    eventId: 'fca6039f-1025-4186-816d-9c80f150d99a', // A Night of Wellness
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Spa_interiors_-_1.jpg',
  },
  {
    eventId: 'd28f73c2-fa04-4915-8659-b20e1f0ef1fa', // Live Music, Sep 3
    // Thumbnail size, not the 12MB original — over fetch-external-image.ts's
    // 8MB download cap.
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Live_band_performing_on_stage_at_night_during_a_music_festival_in_an_outdoor_venue.jpg/1280px-Live_band_performing_on_stage_at_night_during_a_music_festival_in_an_outdoor_venue.jpg',
  },
  {
    eventId: '736975d5-99c7-4171-bd37-a78c81305189', // Live Music, Sep 4
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Live_band_performing_on_stage_at_night_during_a_music_festival_in_an_outdoor_venue.jpg/1280px-Live_band_performing_on_stage_at_night_during_a_music_festival_in_an_outdoor_venue.jpg',
  },
  {
    eventId: '206b5007-3173-4a97-a077-f4bb4d6e0988', // Movies in The Parking Lot: Clue
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Summit_NJ_outdoor_free_summer_movies.jpg',
  },
  {
    eventId: 'c0041aad-206e-4ded-b069-6b4c48306ae5', // Taste of Northalsted 2026 Fall Food & Drink Sampling Crawl
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Sharjah_food_festival.jpg',
  },
]

async function main() {
  for (const fix of FIXES) {
    const result = await enrichEventImage(fix.eventId, { sourceUrl: null, overrideImageUrl: fix.imageUrl })
    console.log(`${fix.eventId}: ${result}`)
  }
}

await main()
process.exit(0)
