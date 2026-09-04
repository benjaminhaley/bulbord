import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Manually curated, visually-verified replacements for the wider shared-
// image cluster cleanup — found via Commons search, downloaded, and viewed
// before use. Several other candidates found in this same pass were
// visually wrong despite plausible titles/keywords (a religious statue for
// "SEED Cohort Open House", a Wikimedia community conference slide for a
// food-sustainability session) and were discarded rather than used.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: '311dbe47-2ebf-40d4-8ab8-6a29923bc106', // Adult Book Discussion: The Bell Jar
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/60/One_More_Page%3B_Book_Club_Keeps_Members_Coming_Back_for_More_DVIDS162529.jpg',
  },
  {
    eventId: 'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Southwest_Virginia_Museum_Artisans_Painting_Class_%2827784079583%29.jpg',
  },
  {
    eventId: '29873c7f-60cc-40c2-9f11-413615d60710', // Cozy Crafting
    // Thumbnail size — the original is ~16MB, over the 8MB download cap.
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Colorful_threads_and_yarns_on_a_wooden_table_with_craft_supplies_in_a_sunny_outdoor_setting.jpg/1280px-Colorful_threads_and_yarns_on_a_wooden_table_with_craft_supplies_in_a_sunny_outdoor_setting.jpg',
  },
  {
    eventId: 'de1d7385-680c-4ef5-be15-fc3722141bff', // Musical Theater Club
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Milwaukee_Youth_Arts_Center.jpg',
  },
  {
    eventId: 'e89c8c83-a6e9-4beb-ae69-52a3610f5b35', // Power Up Thursdays
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Children_playing_video_games_%26_TV%27s.jpg',
  },
  {
    eventId: '8b5dc2a0-5e63-4dac-a763-bf0f83fa33e0', // Power Up Thursdays
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Children_playing_video_games_%26_TV%27s.jpg',
  },
  {
    eventId: 'dc43a5c0-f80d-4091-9c86-d6ba260f29ef', // Recording Studio Certification for Teens
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/32/Unique_Recording_Studio_C.jpg',
  },
  {
    eventId: 'cea71011-6ed2-42c0-a89c-74a1b0ea089a', // Back to School Bash
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/2/20/School_is_in_session%21_Yokota_families%2C_school_faculty_celebrate_students_return_to_school_%289264476%29.jpg',
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
