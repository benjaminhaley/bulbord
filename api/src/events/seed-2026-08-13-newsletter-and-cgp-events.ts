import 'dotenv/config'

import { db } from '../db/client.js'
import { eventSources } from '../db/schema.js'
import { ingestEvents, type CandidateEvent } from './ingest.js'

// Feedback #62: add the Nettelhorst PTO newsletter as a source, starting with
// the New Family Meet and Greet from the Aug 5, 2026 issue. The archive
// (campaign-archive.com) has no stable "latest issue" URL — each issue gets
// its own permalink — so this can't be re-scraped automatically for future
// issues the way a normal listings page can; the source is registered anyway
// (real name, real URL, notes explaining the limitation) so future asks like
// this one have a place to log against, per the resourcing.ts pattern of
// "grab the page, ask Claude to extract events" — just run by hand here
// rather than through the (still-unset-API-key) admin re-run button.
const NETTELHORST_PTO_NEWSLETTER_SOURCE = {
  name: 'Nettelhorst PTO Newsletter',
  url: 'https://us5.campaign-archive.com/?u=e9c0a6f4bd7926e950103a86e&id=f9d376d842',
  type: 'website',
  notes:
    'Nettelhorst PTO email newsletter, archived via Mailchimp campaign-archive.com. Each issue is its own permalink with no stable "latest issue" URL, so this can\'t be picked up by the automated re-sourcing button for future issues — when a new issue has events worth adding, fetch that issue\'s own campaign-archive.com link directly and hand-vet, same as this pass (feedback #62). Scope to real, dated, family/community-facing events (meet-and-greets, school-wide gatherings) — skip purely internal administrative content.',
}

// Feedback #65: Chicago Growth Project's own /events page render's fine via a
// normal fetch+extract pass (confirmed by rendering it headless — the page is
// client-rendered, a plain fetch sees an empty shell) — registered as a real
// active source so future events from them can go through the same button
// once ANTHROPIC_API_KEY is set, not just this one hand-added occurrence.
const CHICAGO_GROWTH_PROJECT_SOURCE = {
  name: 'Chicago Growth Project',
  url: 'https://chicagogrowthproject.org/events',
  type: 'website',
  notes:
    'Housing/urbanist advocacy PAC — hosts occasional family-relevant community events (e.g. family-friendly-housing panels) alongside pure political canvassing/volunteer events. Scope extraction to events genuinely relevant to families/the Nettelhorst community, skip canvassing/volunteer-recruitment events aimed at party organizing. Page is client-rendered (React) — a plain fetch sees an empty shell, so automated re-sourcing (resourcing.ts) will find nothing here until it renders JS; this pass rendered it with Playwright by hand instead.',
}

const NETTELHORST_ADDRESS = '3252 N Broadway, Chicago, IL 60657'
const NEWSLETTER_URL = 'https://us5.campaign-archive.com/?u=e9c0a6f4bd7926e950103a86e&id=f9d376d842'

const newsletterCandidates: CandidateEvent[] = [
  {
    title: 'New Family Meet and Greet',
    description: 'Welcome gathering for families new to the Nettelhorst community.',
    startDate: '2026-08-15',
    startTime: '09:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School — front play lot',
    sourceUrl: NEWSLETTER_URL,
    status: 'approved',
  },
  {
    title: 'Art in the Garden',
    description: 'Drop-in art activity, all ages welcome — supplies provided, stop by for as long as you want.',
    startDate: '2026-08-15',
    startTime: '10:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School — Kinder Garden on Aldine, Door 8',
    sourceUrl: NEWSLETTER_URL,
    status: 'approved',
  },
  {
    title: 'Back to School Bash',
    description: 'Students meet their teacher, drop off supplies, and reconnect with friends to kick off the school year.',
    startDate: '2026-08-20',
    startTime: '15:30',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School — enter through Doors 1, 4, 7, 8, or 9',
    sourceUrl: NEWSLETTER_URL,
    status: 'approved',
  },
  {
    title: 'SEED Cohort Open House',
    description: 'Introduction to the SEED (Seeking Educational Equity and Diversity) program.',
    startDate: '2026-09-16',
    startTime: '17:00',
    allDay: false,
    address: NETTELHORST_ADDRESS,
    locationName: 'Nettelhorst School Library',
    sourceUrl: NEWSLETTER_URL,
    status: 'approved',
  },
]

const cgpCandidates: CandidateEvent[] = [
  {
    title: 'Keep Families in the City! Building Neighborhoods for Lifelong Chicagoans',
    description:
      'Panel discussion on removing barriers to family-friendly housing in Chicago, with Alicia Pederson of Courtyard Urbanist, Alderwoman Leni Manaa-Hoppenworth, and other legislators/housing experts. All ages welcome; doors at 12:30pm. City That Works readers get 25% off admission (whole family included per ticket).',
    startDate: '2026-08-16',
    startTime: '13:00',
    allDay: false,
    address: '4021 N Broadway, Chicago, IL 60613',
    locationName: 'Le Village Cowork Lakeview',
    sourceUrl:
      'https://www.eventbrite.com/e/keep-families-in-the-city-building-neighborhoods-for-lifelong-chicagoans-tickets-1992152874876',
    imageUrl:
      'https://www.eventbrite.com/e/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1187221517%252F2310737029163%252F1%252Foriginal.20260618-190514%3Fcrop%3Dfocalpoint%26fit%3Dcrop%26w%3D940%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26fp-x%3D0.5%26fp-y%3D0.5%26s%3D4ed181f3a49a697f87a9a1cd4c5d47da&w=940&q=75',
    status: 'approved',
  },
]

async function main() {
  const [ptoSource] = await db.insert(eventSources).values(NETTELHORST_PTO_NEWSLETTER_SOURCE).returning({ id: eventSources.id })
  const [cgpSource] = await db.insert(eventSources).values(CHICAGO_GROWTH_PROJECT_SOURCE).returning({ id: eventSources.id })

  const newsletterResult = await ingestEvents(newsletterCandidates, {
    sourceId: ptoSource.id,
    actor: 'claude:manual-sourcing',
  })
  console.log('Nettelhorst PTO Newsletter:', newsletterResult)

  const cgpResult = await ingestEvents(cgpCandidates, {
    sourceId: cgpSource.id,
    actor: 'claude:manual-sourcing',
  })
  console.log('Chicago Growth Project:', cgpResult)
}

await main()
process.exit(0)
