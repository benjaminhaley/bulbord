import 'dotenv/config'

import { enrichEventImage } from './image-enrichment.js'

// Wikimedia's rate limit cleared — applying the remaining verified
// candidates found earlier in this cleanup pass.
const FIXES: { eventId: string; imageUrl: string }[] = [
  {
    eventId: '10d6cd9e-2737-4df0-93dd-d9889bd80d90', // Spring Egg-Stravaganza
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Easter_Egg_Hunt_%285623253840%29.jpg',
  },
  {
    eventId: 'b90a9441-28d7-4515-9ab7-b88b09d64261', // New Year's ReZoolutions
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b4/Fireworks_on_New_Year%27s_Eve_in_a_small_Swabian_village_%281%29%2C_brightened.jpg",
  },
  {
    eventId: '311dbe47-2ebf-40d4-8ab8-6a29923bc106', // Adult Book Discussion: The Bell Jar
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/60/One_More_Page%3B_Book_Club_Keeps_Members_Coming_Back_for_More_DVIDS162529.jpg',
  },
  {
    eventId: 'fb643357-6772-490f-bec4-53863ba88a05', // Canvas and Conversation
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Southwest_Virginia_Museum_Artisans_Painting_Class_%2827784079583%29.jpg',
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
