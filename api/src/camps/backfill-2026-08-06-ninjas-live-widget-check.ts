import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { campSources, eventsLog } from '../db/schema.js'

// Follow-up to backfill-2026-08-06-ninjas-and-skyzone.ts: that script noted
// Ultimate Ninjas' real Mindbody booking calendar couldn't be reliably
// automated at the time, so it flagged the source for a manual spot-check
// (same posture as ClimbZone). Ben pushed back on that limitation directly
// ("why can't you check ultimate ninjas... upgrade in whatever ways
// necessary") — the automation bugs (stale element refs, a force-click
// landing on the wrong day, missing waits) turned out to be real bugs, not a
// genuine wall, and a rewritten script successfully drove the widget.
//
// Result: querying the live widget's own JSONP API (widgets.mindbodyonline.com/
// widgets/schedules/37225/load_markup) directly — not just reading rendered
// text — returned "we didn't find anything available" for every one of 18
// spot-checked dates spanning Sep 2026 through Apr 2027, AND for every date
// in the current month including today, with zero interaction at all (the
// widget's own auto-load on page open already returns empty for today).
// There's only one schedule widget on the page, pointed at the same Mindbody
// studio (329036) the "classic" booking portal also uses, so this isn't a
// case of checking the wrong widget.
//
// This is the same shape of finding as BitSpace/Chicago Park District (a
// stated recurring policy with real pricing, but the live booking system
// shows nothing actually bookable) — but per Ben's explicit call, the 11
// already-seeded candidate camps stay live rather than being pulled (unlike
// BitSpace's hasRecurringOffering:false treatment), since a real, positive,
// specifically-priced offering page still exists and this could reflect a
// scheduling-configuration gap on the provider's end rather than the program
// not running. Only the source notes are updated, to flag the finding
// honestly per the "never trust a stated blanket policy" checklist rule.

const NOTES =
  'Real "Day-Off Camps" page confirms pricing/hours/ages for a recurring non-attendance-day program (Morning $65, ' +
  'Afternoon $65, Full Day $110, ages 5+). However, a direct automated check of the live booking widget (Mindbody ' +
  'schedule 37225, the widget embedded on this page) found ZERO availability for every one of 18 dates spot-checked ' +
  '(Sep 2026 through Apr 2027) and for every date in the current month including today — the widget’s own JSONP ' +
  'API returns "we didn’t find anything available" even on its default auto-load with no interaction. Confirmed ' +
  'with Ben (2026-08-06) that the 11 seeded candidate camps below stay live despite this, since the page’s stated ' +
  'policy/pricing is real and this could be a scheduling-configuration gap on the provider’s end rather than the ' +
  'program not running — but the gap between "stated policy" and "live booking system" is real and worth a human ' +
  'spot-check (call/email the provider) before treating any specific date here as a sure thing.'

async function main() {
  const [source] = await db.select({ id: campSources.id }).from(campSources).where(eq(campSources.name, 'Ultimate Ninjas'))
  if (!source) {
    throw new Error('Ultimate Ninjas camp_sources row not found — did backfill-2026-08-06-ninjas-and-skyzone.ts run yet?')
  }

  await db.update(campSources).set({ notes: NOTES, lastCheckedAt: new Date() }).where(eq(campSources.id, source.id))

  await db.insert(eventsLog).values({
    actor: 'claude:camps-ninjas-widget-check-2026-08-06',
    action: 'camp_source_updated',
    metadata: {
      sourceId: source.id,
      sourceName: 'Ultimate Ninjas',
      reason: 'live Mindbody widget spot-check found zero availability across 18+ dates; notes updated, listings kept live per Ben',
    },
  })

  console.log('Updated Ultimate Ninjas camp_sources notes with live-widget-check finding.')
}

await main()
process.exit(0)
