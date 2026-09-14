import 'dotenv/config'
import { eq } from 'drizzle-orm'

import { db } from '../db/client.js'
import { rejectedEventCandidates } from '../db/schema.js'
import { editRejectedCandidate, approveRejectedCandidate } from './pipeline-review-service.js'

// Feedback, 2026-09-14 ("try harder on Haunted Halsted... you should be
// able to provide a better location... search harder online"): this
// candidate was rejected for a genuinely vague location ("Northalsted," no
// street segment), extracted from northalsted.com's generic /upcoming/
// listing page rather than the event's own dedicated page. Directly
// checking that dedicated page (northalsted.com/main-events/
// haunted-halsted-halloween-parade/) found a real, specific, bounded
// street segment the extraction never saw: Halsted St between Aldine Ave
// and Addison Ave (3200N-3600N), with the parade itself running Belmont to
// Brompton — the same "a bounded street segment is a real address" rule
// this app already applies to other street-fair-style events (Lincoln Ave
// from Wellington to Diversey, Northalsted Market Days).
const CANDIDATE_ID = '61e55ee6-323f-4faf-97e1-4e326a6a722f'
const BEN_USER_ID = '3387293c-2d87-454b-be0c-1d415baba252'
const REAL_EVENT_PAGE = 'https://northalsted.com/main-events/haunted-halsted-halloween-parade/'

async function main() {
  // editRejectedCandidate only covers title/description/address/
  // locationName/date/time — sourceUrl isn't one of its editable fields, so
  // fixed directly here first (same "point at the actual page you'd go to,
  // not a generic listing" rule this codebase already applies everywhere
  // else) before the address/description fix re-scores the checklist.
  const [row] = await db.select({ candidateData: rejectedEventCandidates.candidateData }).from(rejectedEventCandidates).where(eq(rejectedEventCandidates.id, CANDIDATE_ID))
  if (!row) throw new Error('candidate not found')
  await db
    .update(rejectedEventCandidates)
    .set({ candidateData: { ...(row.candidateData as object), sourceUrl: REAL_EVENT_PAGE } })
    .where(eq(rejectedEventCandidates.id, CANDIDATE_ID))

  const editError = await editRejectedCandidate(CANDIDATE_ID, {
    address: 'Halsted St between Aldine Ave & Addison Ave, Chicago, IL',
    description: "Northalsted's annual Halloween block party, parade (Halsted & Belmont to Halsted & Brompton), and costume contest on Halsted Street.",
  })
  if (editError) throw new Error(editError)

  const approveError = await approveRejectedCandidate(CANDIDATE_ID, BEN_USER_ID, 'Real bounded location found on the event\'s own dedicated page')
  if (approveError === 'not_found') throw new Error('not_found on approve')
  console.log(approveError === 'deduped' ? 'Deduped — already exists' : 'Added as a real event')
}

await main()
process.exit(0)
