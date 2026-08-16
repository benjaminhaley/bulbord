// Fixed topic picker (feedback #97) — confirmed with Ben rather than
// invented: a short, broad set covering what's actually been sourced so far
// (movie nights, park district activities, library events, etc.). Plain
// text on the wire (events.topic, see api/src/db/schema.ts), not a DB enum
// — validated only here, client-side, same posture as the role picker.
export const EVENT_TOPIC_OPTIONS = ['Movie Night', 'Sports & Fitness', 'Arts & Crafts', 'Community & Social', 'Other'] as const
