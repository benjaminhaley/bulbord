import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, sportsClubOccurrences, sportsClubs, sportsClubSources } from '../db/schema.js'

// Feedback #107 (2026-08-19), from a live screenshot of "Dance on Broadway
// — Lovebug Tots": that one listing bundled 3 genuinely distinct weekly
// class sections (Fri 10am, Sat 9am, Sat 9:30am) into a single Options
// table row set. "Let's just make this three separate listings one for
// each schedule. Please apply that to this case and all cases." This isn't
// just a display preference — it's also the root cause of feedback #106's
// bug: matchesScheduleFilter (web/src/sports-clubs/filters.ts) can only
// check a listing against its own single "next" occurrence, so a listing
// bundling Monday/Tuesday/Friday classes together can never correctly
// match a specific-day filter. Splitting each real class section into its
// own listing (one real schedule per row) fixes this by construction, the
// same way yesterday's per-level rebuild fixed the wrong-domain sourcing
// bug.
//
// This supersedes backfill-2026-08-19-dance-on-broadway-rebuild.ts's own
// per-LEVEL grouping (16 rows, each with a multi-row Options table) with
// per-CLASS rows (~64 + 1 team-training row) — the LEVELS class/day/time
// data below is copied verbatim from that script (already real, verified
// against the studio's own PDF schedule — see that file's header comment
// for the extraction method) and is not being re-derived. What's new here:
// (1) one row per class instead of one row per level, (2) a real, specific
// program description per class — not just "Ages X-Y" — sourced from
// danceonbroadwaychi.com/youth-class-level-descriptions (feedback #110:
// "there's a great description of the lovebug program that's not present
// in your description... find and include things like this"), and (3) no
// price_note: price is now a single verified flat rate ($475, per the
// studio's own Mindbody store) divided by the real session count for that
// specific day (14 for Monday, 15 for every other weekday) to get the
// weekly figure — a plain, self-evident division that needs no "how we
// derived this" explanation (feedback #109), unlike the previous per-level
// version's assumption that only the $33.93/week rate (not the $475 total)
// carried over to non-Monday classes.

const SEASON_START = '2026-08-31'
const SEASON_END = '2026-12-20'
const LABOR_DAY = '2026-09-07'
const THANKSGIVING_WEEK_START = '2026-11-23'
const THANKSGIVING_WEEK_END = '2026-11-29'
const PRICE = 475

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface OccurrenceRow {
  date: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

function weeklyOccurrences(dayOfWeek: number, startTime: string, endTime: string): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []
  const cursor = new Date(`${SEASON_START}T00:00:00Z`)
  const end = new Date(`${SEASON_END}T00:00:00Z`)
  const thanksgivingStart = new Date(`${THANKSGIVING_WEEK_START}T00:00:00Z`)
  const thanksgivingEnd = new Date(`${THANKSGIVING_WEEK_END}T00:00:00Z`)
  while (cursor <= end) {
    if (cursor.getUTCDay() === dayOfWeek) {
      const dateStr = toDateString(cursor)
      const isThanksgivingWeek = cursor >= thanksgivingStart && cursor <= thanksgivingEnd
      const isLaborDay = dateStr === LABOR_DAY
      if (!isThanksgivingWeek && !isLaborDay) {
        rows.push({ date: dateStr, startTime, endTime, note: null })
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return rows
}

function sessionCount(dayOfWeek: number): number {
  return dayOfWeek === 1 ? 14 : 15
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// House time-format style (STYLE_GUIDE.md) applied inline for a readable
// title suffix — "Fri, 10am" / "Sat, 9:30am" — same rules web/src/sports-
// clubs/format.ts's formatSingleTime uses (no :00 minutes, lowercase am/pm).
function shortTime(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const minutePart = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${hour12}${minutePart}${hour >= 12 ? 'pm' : 'am'}`
}

interface ClassSection {
  level: string
  ageMin: number | null
  ageMax: number | null
  className: string
  description: string
  day: number // 0=Sun..6=Sat
  start: string
  end: string
  teamOnly?: boolean
}

// Real class-specific program descriptions, verbatim from
// danceonbroadwaychi.com/youth-class-level-descriptions (fetched
// 2026-08-19). A handful of team-only Technique sections have no dedicated
// public description on that page (they're a competition-team supplement,
// not one of the studio's own publicly listed classes) — those keep a
// short, honest description rather than a mismatched or invented one; see
// each one's own inline note below.
const SECTIONS: ClassSection[] = [
  // Lovebug Tots
  {
    level: 'Lovebug Tots',
    ageMin: 1,
    ageMax: 3,
    className: 'Lovebug Tots',
    description:
      'Lovebug Tots is a 30-minute "grown-up and me" class designed for dancers ages 18 months to 3 years old. This playful and engaging class invites our youngest movers to connect with their caregivers while exploring movement through imagination, music, and a gentle introduction to the world of dance! This is a caregiver and dancer class — a grown-up must attend class with the dancer.',
    day: 5,
    start: '10:00',
    end: '10:30',
  },
  {
    level: 'Lovebug Tots',
    ageMin: 1,
    ageMax: 3,
    className: 'Lovebug Tots',
    description:
      'Lovebug Tots is a 30-minute "grown-up and me" class designed for dancers ages 18 months to 3 years old. This playful and engaging class invites our youngest movers to connect with their caregivers while exploring movement through imagination, music, and a gentle introduction to the world of dance! This is a caregiver and dancer class — a grown-up must attend class with the dancer.',
    day: 6,
    start: '9:00',
    end: '9:30',
  },
  {
    level: 'Lovebug Tots',
    ageMin: 1,
    ageMax: 3,
    className: 'Lovebug Tots',
    description:
      'Lovebug Tots is a 30-minute "grown-up and me" class designed for dancers ages 18 months to 3 years old. This playful and engaging class invites our youngest movers to connect with their caregivers while exploring movement through imagination, music, and a gentle introduction to the world of dance! This is a caregiver and dancer class — a grown-up must attend class with the dancer.',
    day: 6,
    start: '9:30',
    end: '10:00',
  },
  // Lovebug
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Combo',
    description:
      "This upbeat, fast-paced class combines Ballet, Tap, and Jazz—keeping your dancer moving, smiling, and engaged from start to finish! It's a fantastic introduction to multiple styles of dance, helping young dancers build coordination, rhythm, and confidence in a fun and supportive environment.",
    day: 1,
    start: '15:45',
    end: '16:30',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Combo',
    description:
      "This upbeat, fast-paced class combines Ballet, Tap, and Jazz—keeping your dancer moving, smiling, and engaged from start to finish! It's a fantastic introduction to multiple styles of dance, helping young dancers build coordination, rhythm, and confidence in a fun and supportive environment.",
    day: 3,
    start: '10:00',
    end: '10:45',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Ballet/Jazz',
    description:
      'This combo class is a fun and imaginative introduction to the world of dance for our youngest movers! Dancers will explore the basics of Ballet and Jazz through playful exercises, storytelling, and creative movement. With a focus on rhythm, coordination, and musicality, this class helps build confidence and classroom skills in a nurturing and upbeat environment. Perfect for budding dancers ready to twirl, leap, and groove!',
    day: 3,
    start: '15:30',
    end: '16:15',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Hip-Hop',
    description:
      'Lovebug Hip Hop introduces young dancers to the basics of hip hop in a high-energy and upbeat class filled with fun! Dancers will explore rhythm, coordination, and expressive movement—all while building confidence and having a blast.',
    day: 5,
    start: '15:30',
    end: '16:15',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Ballet',
    description:
      'Lovebug Ballet introduces young dancers to the fundamentals of ballet through playful movement, imaginative games, and fun visual imagery. This class is a wonderful way for little ones to discover the joy of dance while building coordination, musicality, and foundational ballet skills in a supportive and creative environment.',
    day: 6,
    start: '10:00',
    end: '10:45',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Combo',
    description:
      "This upbeat, fast-paced class combines Ballet, Tap, and Jazz—keeping your dancer moving, smiling, and engaged from start to finish! It's a fantastic introduction to multiple styles of dance, helping young dancers build coordination, rhythm, and confidence in a fun and supportive environment.",
    day: 6,
    start: '9:00',
    end: '9:45',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Ballet',
    description:
      'Lovebug Ballet introduces young dancers to the fundamentals of ballet through playful movement, imaginative games, and fun visual imagery. This class is a wonderful way for little ones to discover the joy of dance while building coordination, musicality, and foundational ballet skills in a supportive and creative environment.',
    day: 0,
    start: '9:00',
    end: '9:45',
  },
  {
    level: 'Lovebug',
    ageMin: 3,
    ageMax: 5,
    className: 'Lovebug Combo',
    description:
      "This upbeat, fast-paced class combines Ballet, Tap, and Jazz—keeping your dancer moving, smiling, and engaged from start to finish! It's a fantastic introduction to multiple styles of dance, helping young dancers build coordination, rhythm, and confidence in a fun and supportive environment.",
    day: 0,
    start: '10:00',
    end: '10:45',
  },
  // Mini
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Ballet/Jazz',
    description:
      'This energetic combo class introduces young dancers to both Ballet and Jazz, giving them a well-rounded foundation in two essential styles. In the Ballet portion, dancers will learn basic positions, foundational technique, and introductory ballet vocabulary in a supportive and structured setting. In the Jazz portion, dancers will explore upbeat movement, musicality, and expression through floor exercises, body isolations, and across-the-floor combinations.',
    day: 1,
    start: '16:30',
    end: '17:15',
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Jazz/Hip-Hop',
    description:
      "This fun and energetic combo class introduces young dancers to the exciting styles of Jazz and Hip Hop! Dancers will start with a warm-up and stretch, followed by across-the-floor movement in both styles. In Hip Hop, they'll explore rhythm, isolations, and expressive movement. In Jazz, they'll build coordination, strength, and technique through stylized exercises and combinations.",
    day: 2,
    start: '15:30',
    end: '16:15',
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Acro/Jazz',
    description:
      'Mini Acro/Jazz is designed for dancers ages 5–7 who are ready to build strength, flexibility, and confidence through both acrobatic arts and jazz dance. The Acro portion focuses on developing proper technique through stretching and conditioning exercises, providing the foundation for safely learning beginner-level skills such as forward rolls, backward rolls, bridges, handstands, and cartwheels. The Jazz portion introduces upbeat, stylized movement, musicality, and basic jazz vocabulary.',
    day: 6,
    start: '11:00',
    end: '11:45',
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Combo',
    description:
      'This lively combo class introduces young dancers to Ballet, Tap, and Jazz—all in one fun-filled class! Building on the fundamentals learned in our Lovebug classes, this class keeps dancers moving and engaged while exploring three foundational dance styles, developing coordination, rhythm, musicality, and basic technique in an upbeat and encouraging environment.',
    day: 6,
    start: '10:00',
    end: '10:45',
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Hip-Hop',
    description:
      'Mini Hip Hop is a high-energy class that introduces dancers to the fundamentals of hip hop while beginning to explore more challenging movements and combinations. Each class includes a warm-up, stretching, across-the-floor exercises, mat work, and a fun, age-appropriate hip hop combo—plus games and activities to keep dancers engaged and excited to learn.',
    day: 0,
    start: '9:00',
    end: '9:45',
  },
  {
    level: 'Mini',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Ballet/Jazz',
    description:
      'This energetic combo class introduces young dancers to both Ballet and Jazz, giving them a well-rounded foundation in two essential styles. In the Ballet portion, dancers will learn basic positions, foundational technique, and introductory ballet vocabulary in a supportive and structured setting. In the Jazz portion, dancers will explore upbeat movement, musicality, and expression through floor exercises, body isolations, and across-the-floor combinations.',
    day: 0,
    start: '10:00',
    end: '10:45',
  },
  // Mini 2
  {
    level: 'Mini 2',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Jazz 2',
    description:
      'Mini Jazz 2 is perfect for young dancers who are ready to build on their foundational jazz skills with added technique and structure. This upbeat class focuses on jazz vocabulary, musicality, coordination, and stylized movement, strengthening flexibility, balance, and performance skills through fun warm-ups, across-the-floor exercises, and energetic combinations.',
    day: 1,
    start: '16:15',
    end: '17:00',
  },
  {
    level: 'Mini 2',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Ballet 2',
    description:
      'Mini Ballet 2 is designed for young dancers who are ready to continue building their ballet foundation with more focus and structure. This class introduces essential ballet technique in a fun and engaging way, using creative movement, music, and age-appropriate exercises to develop strength, balance, posture, and vocabulary.',
    day: 1,
    start: '17:15',
    end: '18:00',
  },
  {
    level: 'Mini 2',
    ageMin: 5,
    ageMax: 7,
    className: 'Mini Contemporary/Lyrical',
    description:
      'Mini Contemporary/Lyrical introduces dancers to the expressive and technical foundations of contemporary and lyrical dance — movement that emphasizes musicality, storytelling, fluidity, and emotional expression while continuing to build strength, flexibility, balance, and coordination, with a focus on proper technique, transitions, floor work, and artistry.',
    day: 5,
    start: '16:15',
    end: '17:00',
  },
  // Level 1
  {
    level: 'Level 1',
    ageMin: 7,
    ageMax: 9,
    className: 'Jazz 1',
    description:
      'Jazz 1 is a high-energy class that introduces dancers to the fundamentals of jazz dance. Dancers begin with a dynamic warm-up focused on stretching, strengthening, and isolations to build control and body awareness, then work on rhythm, coordination, and musicality as they develop beginner jazz vocabulary including basic turns, jumps, and across-the-floor progressions. Each class concludes with a choreographed combination.',
    day: 5,
    start: '16:00',
    end: '17:00',
  },
  {
    level: 'Level 1',
    ageMin: 7,
    ageMax: 9,
    className: 'Ballet 1',
    description:
      'In this foundational class, dancers are introduced to basic ballet positions and begin developing the proper body alignment essential to classical ballet, building their vocabulary through barre work, center exercises, and across-the-floor combinations. Focus is placed on musicality, coordination, and foundational concepts such as rotation, port de bras, and proper posture, along with introductory turns and jumps.',
    day: 0,
    start: '11:00',
    end: '12:00',
  },
  {
    level: 'Level 1',
    ageMin: 7,
    ageMax: 9,
    className: 'Tap 1',
    description:
      'Tap 1 introduces dancers to the fundamentals of tap dance — basic steps, rhythms, and terminology — while building a strong foundation in musicality, timing, and weight shifts. The class also focuses on developing coordination, balance, and listening skills.',
    day: 2,
    start: '17:00',
    end: '18:00',
  },
  {
    level: 'Level 1',
    ageMin: 7,
    ageMax: 9,
    className: 'Hip-Hop 1',
    description:
      'Hip Hop 1 introduces dancers to the foundations of hip hop while encouraging individual style, self-expression, and confidence, exploring rhythm, coordination, and musicality with an emphasis on the cultural roots and history of the genre. Class includes foundational grooves, footwork, floor work, and freestyle exploration.',
    day: 5,
    start: '18:00',
    end: '19:00',
  },
  // Level 1x
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    className: 'Ballet 1X',
    description:
      'Ballet 1X is an elevated version of Level 1 Ballet, designed for dancers on the competition team or those ready for a more focused and disciplined ballet experience — increased attention to alignment, strength, and precision through barre work, center exercises, and across-the-floor progressions, alongside enhanced performance quality and control.',
    day: 1,
    start: '16:15',
    end: '17:15',
  },
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    className: 'Jazz 1X',
    description:
      'Jazz 1X is an advanced version of Jazz 1, tailored for dancers on the competition team or those ready to take their jazz technique to the next level — refining foundational jazz skills with greater emphasis on precision, strength, and performance quality through challenging warm-ups, across-the-floor exercises, and dynamic choreography.',
    day: 1,
    start: '17:15',
    end: '18:15',
  },
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    className: 'Ballet 1X',
    description:
      'Ballet 1X is an elevated version of Level 1 Ballet, designed for dancers on the competition team or those ready for a more focused and disciplined ballet experience — increased attention to alignment, strength, and precision through barre work, center exercises, and across-the-floor progressions, alongside enhanced performance quality and control.',
    day: 6,
    start: '11:00',
    end: '12:00',
  },
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    className: 'Hip-Hop 1X',
    description:
      'Hip Hop 1X is a more advanced hip hop class designed for dancers on the competition team or those ready for a higher level of technical skill and performance — challenging choreography that highlights sharp footwork, grooves, floor work, and freestyle elements, with strong musicality and stage presence.',
    day: 4,
    start: '18:00',
    end: '19:00',
  },
  {
    level: 'Level 1x',
    ageMin: 7,
    ageMax: 9,
    className: 'Contemporary 1X',
    description:
      'Contemporary 1X is an advanced contemporary dance class designed for competition dancers or those ready to deepen their technical skills and expressive movement — greater emphasis on strength, control, fluidity, and dynamic choreography, exploring complex floor work, turns, jumps, and improvisation.',
    day: 4,
    start: '16:45',
    end: '17:45',
  },
  // Level 1/2
  {
    level: 'Level 1/2',
    ageMin: 7,
    ageMax: 9,
    // No dedicated public class description for this team-only supplement
    // exists on the studio's own class-level-descriptions page — kept
    // honest rather than reusing another level's mismatched text (feedback
    // #110's own "find and include real descriptions" rule cuts both ways:
    // don't fabricate one where none exists).
    className: 'Level 1/2 Technique (Team)',
    description: 'Supplementary technique class for competition team dancers at this level — not a standalone enrollment.',
    day: 3,
    start: '16:15',
    end: '17:15',
    teamOnly: true,
  },
  {
    level: 'Level 1/2',
    ageMin: 7,
    ageMax: 9,
    className: 'Musical Theater 1/2',
    description:
      'Musical Theater 1/2 is a fun and expressive dance class that focuses on storytelling through movement, combining dance and performance skills. Dancers begin with a jazz-based warm-up and beginner across-the-floor exercises, then move into acting activities that help develop the tools needed to convey character and emotion through dance, using music from both classic and contemporary musicals.',
    day: 6,
    start: '12:00',
    end: '13:00',
  },
  {
    level: 'Level 1/2',
    ageMin: 7,
    ageMax: 9,
    className: 'Acro 1/2',
    description:
      'Acro 1/2 is a foundational class for dancers ready to build strength, flexibility, and coordination while learning essential acrobatic skills — stretching and conditioning combined with beginner to intermediate tricks such as forward and backward rolls, bridges, handstands, cartwheels, and controlled transitions, with emphasis on proper technique and safety.',
    day: 4,
    start: '15:45',
    end: '16:45',
  },
  {
    level: 'Level 1/2',
    ageMin: 7,
    ageMax: 9,
    className: 'Poms 1/2',
    description:
      'Poms 1/2 is an energetic class introducing dancers to the fundamentals of pom technique and performance — basic pom motions, sharp arm movements, precise footwork, and synchronization skills, building strength, coordination, and rhythm alongside spirited performance elements.',
    day: 0,
    start: '11:00',
    end: '12:00',
  },
  // Level 2
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    className: 'Ballet 2',
    description:
      'In Ballet 2, students continue to develop the proper body alignment essential to classical ballet while learning a wider variety of steps, including more challenging jumps, turns, and progressions. Strong emphasis is placed on stretching and strengthening to support technique, building strength, coordination, and confidence.',
    day: 1,
    start: '18:15',
    end: '19:30',
  },
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    className: 'Contemporary 2',
    description:
      'Contemporary 2 builds upon foundational contemporary technique, offering dancers the opportunity to deepen their personal movement quality while focusing on proper alignment and control — more advanced improvisation and floor work, challenging progressions, and emphasis on smooth transitions, musicality, and expressive storytelling.',
    day: 3,
    start: '18:00',
    end: '19:00',
  },
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    className: 'Ballet 2',
    description:
      'In Ballet 2, students continue to develop the proper body alignment essential to classical ballet while learning a wider variety of steps, including more challenging jumps, turns, and progressions. Strong emphasis is placed on stretching and strengthening to support technique, building strength, coordination, and confidence.',
    day: 4,
    start: '18:00',
    end: '19:15',
  },
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    className: 'Jazz 2',
    description:
      'Jazz 2 is a high-energy class that builds on foundational jazz concepts and technique through focused warm-ups emphasizing stretching, strengthening, and isolations. Students continue developing rhythm, coordination, and jazz vocabulary, including more advanced turns, jumps, and across-the-floor progressions.',
    day: 5,
    start: '15:45',
    end: '16:45',
  },
  {
    level: 'Level 2',
    ageMin: 10,
    ageMax: 12,
    className: 'Hip-Hop 2',
    description:
      'Hip Hop 2 is designed for dancers who are growing in confidence and ready to take on faster-paced choreography and more complex movements — popping, locking, and breaking, deepening understanding of hip hop history and culture, with increasingly challenging footwork and floor work.',
    day: 5,
    start: '17:00',
    end: '18:00',
  },
  // Level 2x
  {
    level: 'Level 2x',
    ageMin: 10,
    ageMax: 12,
    className: 'Jazz 2X',
    description:
      'Jazz 2X is a high-energy class for dancers ready to take on a more challenging pace and advanced level of jazz training — a strong technical foundation through focused warm-ups emphasizing flexibility, strength, alignment, and isolations, progressing through more complex turns, jumps, leaps, and across-the-floor combinations.',
    day: 2,
    start: '18:00',
    end: '19:00',
  },
  {
    level: 'Level 2x',
    ageMin: 10,
    ageMax: 12,
    className: 'Contemporary 2X',
    description:
      'Contemporary 2X builds upon foundational contemporary technique in a fast-paced, challenging environment — refining proper alignment, control, and movement quality while exploring more advanced floor work, improvisation, inversions, and dynamic movement sequences.',
    day: 3,
    start: '16:15',
    end: '17:15',
  },
  {
    level: 'Level 2x',
    ageMin: 10,
    ageMax: 12,
    className: 'Hip-Hop 2X',
    description:
      'Hip Hop 2X is designed for dancers ready for a faster-paced, more rigorous hip hop experience — intricate choreography, advanced musicality, and increasingly complex footwork, grooves, floor work, and tricks, across popping, locking, and breaking.',
    day: 3,
    start: '19:15',
    end: '20:15',
  },
  // Level 2/3
  {
    level: 'Level 2/3',
    ageMin: 10,
    ageMax: 13,
    className: 'Level 2/3 Technique (Team)',
    description: 'Supplementary technique class for competition team dancers at this level — not a standalone enrollment.',
    day: 2,
    start: '16:00',
    end: '17:00',
    teamOnly: true,
  },
  {
    level: 'Level 2/3',
    ageMin: 10,
    ageMax: 13,
    className: 'Tap 2/3',
    description:
      'Tap 2/3 builds upon foundational tap techniques, helping dancers refine their skills and expand their tap vocabulary — emphasis on musicality, rhythm, and weight shifts, while continuing to develop essential fundamentals such as balance and coordination.',
    day: 5,
    start: '17:00',
    end: '18:00',
  },
  // Level 3
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 3',
    description:
      'Students continue to develop the proper body alignment essential for classical ballet while being introduced to a wider variety of steps, including more difficult jumps and turns. The complexity and length of combinations increase, pushing dancers to refine their technique and endurance. Requires studio approval for enrollment.',
    day: 1,
    start: '19:00',
    end: '20:15',
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 3 Technique',
    description:
      'Students continue to develop the proper body alignment essential for classical ballet while being introduced to a wider variety of steps, including more difficult jumps and turns. Requires studio approval for enrollment. Ballet 3 Technique does not have a spring recital — it focuses solely on the technique and art of ballet.',
    day: 6,
    start: '9:00',
    end: '10:15',
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 3',
    description:
      'Students continue to develop the proper body alignment essential for classical ballet while being introduced to a wider variety of steps, including more difficult jumps and turns. The complexity and length of combinations increase, pushing dancers to refine their technique and endurance. Requires studio approval for enrollment.',
    day: 4,
    start: '16:45',
    end: '18:00',
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Jazz 3',
    description:
      'Dancers further expand their jazz vocabulary by mastering more complex turns, jumps, and intricate progressions and transitions, with challenging stretching and strengthening exercises built to develop strength, flexibility, and control, and an emphasis on individual style and performance quality.',
    day: 2,
    start: '18:00',
    end: '19:00',
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Contemporary 3',
    description:
      'Contemporary 3 builds on advanced contemporary technique, encouraging dancers to deepen their personal movement quality while focusing on proper alignment and control — increased improvisation, floor work, and more challenging, extended progressions, with emphasis on seamless transitions and musicality.',
    day: 3,
    start: '17:15',
    end: '18:15',
  },
  {
    level: 'Level 3',
    ageMin: 12,
    ageMax: null,
    className: 'Hip-Hop 3',
    description:
      'Hip Hop 3 is designed for dancers confident in their skills and ready to tackle faster-paced choreography with more complex moves and grooves — popping, locking, and breaking, deepening understanding of hip hop culture, with increasingly challenging floor work and footwork.',
    day: 3,
    start: '18:15',
    end: '19:15',
  },
  // Level 3/4
  {
    level: 'Level 3/4',
    ageMin: 12,
    ageMax: null,
    className: 'Musical Theater 3/4',
    description:
      'Musical Theater Jazz 3/4 is a high-energy class for intermediate/advanced dancers looking to refine their Musical Theater Jazz technique while exploring performance and storytelling through movement — strength, flexibility, precision, and character development, dancing to popular and classic Musical Theater songs.',
    day: 1,
    start: '17:15',
    end: '18:15',
  },
  {
    level: 'Level 3/4',
    ageMin: 12,
    ageMax: null,
    className: 'Acro 3/4',
    description:
      'Acro 3/4 is designed for experienced acro dancers ready to advance their strength, flexibility, and technical skills — advanced tumbling, balances, flexibility tricks, and dynamic transitions, with emphasis on proper technique, body control, conditioning, and safe progressions. By approval only.',
    day: 3,
    start: '16:15',
    end: '17:15',
  },
  // Level 4
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 4',
    description:
      'Ballet 4 is an advanced class for dancers with a strong technical foundation ready to master complex ballet vocabulary and combinations — precision, strength, and artistry, focusing on advanced jumps, turns, extensions, and fluid transitions, preparing dancers for pre-professional training, performances, and competitive environments.',
    day: 1,
    start: '18:15',
    end: '19:30',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 4 Technique',
    description:
      'An advanced class for dancers with a strong technical foundation ready to master complex ballet vocabulary and combinations — precision, strength, and artistry, focusing on advanced jumps, turns, extensions, and fluid transitions. Ballet 4 Technique does not have a spring recital — it focuses solely on the technique and art of ballet.',
    day: 6,
    start: '10:15',
    end: '11:30',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Ballet 4',
    description:
      'Ballet 4 is an advanced class for dancers with a strong technical foundation ready to master complex ballet vocabulary and combinations — precision, strength, and artistry, focusing on advanced jumps, turns, extensions, and fluid transitions, preparing dancers for pre-professional training, performances, and competitive environments.',
    day: 4,
    start: '16:45',
    end: '18:00',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Jazz 4',
    description:
      'Jazz 4 is an advanced, high-energy class for dancers ready to refine and elevate their jazz technique — complex choreography, sharp and precise movements, and dynamic styling, working on advanced turns, leaps, isolations, and progressions.',
    day: 2,
    start: '18:00',
    end: '19:00',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Contemporary 4',
    description:
      'Contemporary 4 is an advanced class for dancers with strong technique and expressive skills — complex choreography, intricate floor work, and sophisticated improvisation, with emphasis on fluidity, dynamic transitions, and emotional storytelling through movement.',
    day: 3,
    start: '18:15',
    end: '19:15',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Hip-Hop 4',
    description:
      'Hip Hop 4 is an advanced, high-energy class for dancers with strong foundational skills ready to master complex choreography and advanced hip hop styles — precision, rhythm, sharp footwork, intricate grooves, and dynamic floor work across popping, locking, breaking, and freestyle.',
    day: 3,
    start: '19:15',
    end: '20:15',
  },
  {
    level: 'Level 4',
    ageMin: 12,
    ageMax: null,
    className: 'Pre-Pointe',
    description:
      'Designed for dancers preparing to begin pointe work or taking their first steps en pointe — building the strength, alignment, and technique necessary to safely transition to pointe, including exercises targeting foot, ankle, and core stability. Requires instructor approval.',
    day: 4,
    start: '16:00',
    end: '16:45',
  },
  // Level 5
  {
    level: 'Level 5',
    ageMin: 14,
    ageMax: null,
    className: 'Acro 5',
    description:
      'Acro 5 is an advanced acro class for highly skilled dancers with a strong foundation in acrobatic technique ready to master more complex and demanding skills — advanced tumbling, flexibility, strength, control, and dynamic transitions, with emphasis on precision, execution, and performance quality. By approval only.',
    day: 3,
    start: '17:15',
    end: '18:15',
  },
  {
    level: 'Level 5',
    ageMin: 14,
    ageMax: null,
    className: 'Level 5 Technique (Team)',
    description: 'Supplementary technique class for competition team dancers at this level — not a standalone enrollment.',
    day: 2,
    start: '16:15',
    end: '17:15',
    teamOnly: true,
  },
  {
    level: 'Level 5',
    ageMin: 14,
    ageMax: null,
    className: 'Pointe 1',
    description:
      'This ballet class introduces dancers to pointe work and the use of pointe shoes. Enrollment is by invitation only and requires dancers to be at Level 4 with instructor approval.',
    day: 1,
    start: '19:30',
    end: '20:15',
  },
  // Teen
  {
    level: 'Teen',
    ageMin: 13,
    ageMax: null,
    className: 'Teen Beginner Jazz',
    description:
      'Teen Beginner Jazz is designed for dancers ages 13+ looking to build confidence, improve their jazz technique, and enjoy a fun, supportive class environment — foundational jazz skills including alignment, flexibility, strength, isolations, turns, jumps, and musicality, with choreography that encourages individuality and performance quality.',
    day: 4,
    start: '19:00',
    end: '20:00',
  },
]

const ADDRESS = '3126 N Broadway, Chicago, IL 60657'
const LAT = 41.9395
const LNG = -87.6449
const SOURCE_URL = 'https://danceonbroadwaychi.com/youthschedule'

async function main() {
  const [source] = await db.select().from(sportsClubSources).where(eq(sportsClubSources.name, 'Dance on Broadway')).limit(1)
  if (!source) throw new Error('Dance on Broadway source row not found')

  // Soft-delete every existing per-level Dance on Broadway listing (from
  // yesterday's rebuild) except Team Training, which isn't part of the
  // studio's public per-class system and stays as its own standalone row.
  const existing = await db
    .select({ id: sportsClubs.id, title: sportsClubs.title, imageUrl: sportsClubs.imageUrl, thumbnailUrl: sportsClubs.thumbnailUrl })
    .from(sportsClubs)
    .where(eq(sportsClubs.sourceId, source.id))
  const toDelete = existing.filter((c) => c.title !== 'Dance on Broadway — Team Training')
  const image = existing[0] // reuse the already-enriched real image rather than re-fetching it

  for (const row of toDelete) {
    await db.update(sportsClubs).set({ deletedAt: new Date() }).where(eq(sportsClubs.id, row.id))
  }
  console.log(`Soft-deleted ${toDelete.length} per-level listing(s).`)

  const seenTitles = new Map<string, number>()
  let insertedCount = 0
  let occurrenceCount = 0

  for (const section of SECTIONS) {
    const dayName = DAY_NAMES[section.day]
    const timeSuffix = shortTime(section.start)
    const baseTitle = `Dance on Broadway — ${section.className} (${dayName}, ${timeSuffix})`
    // Guard against two sections that happen to share the exact same
    // class/day/time label (shouldn't occur in real data, but titles are
    // meant to be unambiguous) by appending a disambiguating suffix.
    const dupeCount = seenTitles.get(baseTitle) ?? 0
    seenTitles.set(baseTitle, dupeCount + 1)
    const title = dupeCount === 0 ? baseTitle : `${baseTitle} #${dupeCount + 1}`

    const weeks = sessionCount(section.day)
    const pricePerWeek = PRICE / weeks

    const [row] = await db
      .insert(sportsClubs)
      .values({
        title,
        description: section.description,
        category: 'Dance',
        scheduleType: 'fixed_session',
        firstDate: SEASON_START,
        lastDate: SEASON_END,
        cadenceNote: null,
        ageMin: section.ageMin,
        ageMax: section.ageMax,
        price: PRICE.toFixed(2),
        priceUnit: `per ${weeks}-week series`,
        pricePerWeek: pricePerWeek.toFixed(2),
        priceNote: null,
        options: null,
        address: ADDRESS,
        locationName: 'Dance on Broadway',
        latitude: LAT.toString(),
        longitude: LNG.toString(),
        distanceMiles: '0.10',
        signupStatus: 'open',
        signupInstructions: "Register online via the studio's class schedule — Fall 2026 (Season 7) registration is open now.",
        sourceUrl: SOURCE_URL,
        sourceId: source.id,
        imageUrl: image.imageUrl,
        thumbnailUrl: image.thumbnailUrl,
        status: 'approved',
      })
      .returning({ id: sportsClubs.id })
    insertedCount++

    const occurrences = weeklyOccurrences(section.day, `${section.start}:00`, `${section.end}:00`)
    if (occurrences.length > 0) {
      await db.insert(sportsClubOccurrences).values(occurrences.map((o) => ({ sportsClubId: row.id, ...o })))
      occurrenceCount += occurrences.length
    }
  }

  await db.insert(eventsLog).values({
    actor: 'system:backfill-2026-08-19-split-dance-on-broadway-classes',
    action: 'sports_club_created',
    metadata: { insertedCount, occurrenceCount, note: 'Split 16 per-level listings into one listing per real weekly class section (feedback #107)' },
  })

  console.log(`Inserted ${insertedCount} per-class listings and ${occurrenceCount} occurrence rows.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
