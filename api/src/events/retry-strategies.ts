import { desc, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, pipelineRetryNotes } from '../db/schema.js'

// Capped, not the full table — an unbounded list would eventually blow out
// prompt size for diminishing benefit, and the newest notes are the most
// likely to describe a problem still worth watching for (feedback #165,
// 2026-09-14).
const MAX_STRATEGIES_IN_PROMPT = 15

export type RetryStage = 'photo_extraction' | 'description_extraction' | 'pipeline_review'

// Persists a retry note into the shared, growing library (see the
// pipelineRetryNotes schema comment) and logs it into events_log too — the
// existing Recent Activity admin view is an exclusion list, not an
// allowlist (see CLAUDE.md's Analytics section), so this shows up there
// automatically with no dedicated admin UI needed.
export async function recordRetryNote(input: {
  note: string
  stage: RetryStage
  eventId?: string | null
  contextTitle?: string | null
  userId: string
  outcome?: string | null
}): Promise<void> {
  const note = input.note.trim()
  if (!note) return
  await Promise.all([
    db.insert(pipelineRetryNotes).values({
      eventId: input.eventId ?? null,
      stage: input.stage,
      note,
      contextTitle: input.contextTitle ?? null,
      outcome: input.outcome ?? null,
      createdByUserId: input.userId,
    }),
    db.insert(eventsLog).values({
      actor: input.userId,
      action: 'pipeline_retry_note_added',
      metadata: { stage: input.stage, eventId: input.eventId ?? null, note, outcome: input.outcome ?? null },
    }),
  ])
}

// Formats the most recent notes as a block a prompt can append to its own
// system prompt — real corrections a person has had to ask for before, on
// other events, so the pipeline watches for the same kinds of problems
// without being asked again ("these should be strategies it pulls on itself
// to try to solve problems before giving up" — feedback #165). Since
// 2026-09-28 it's also appended to the *initial* extraction prompts
// (resourcing.ts, email-ingest.ts), not only retries — Ben: "this note should
// be some of the context it takes in when it's doing the initial pipeline so
// that it might do it better and see what mistakes it's made historically."
// Each note carries its outcome when known, so a later pass sees what was
// actually done about it. Returns '' (append is then a no-op) when there's
// nothing recorded yet.
export async function getRetryStrategiesPromptBlock(audience: 'retry' | 'extraction' = 'retry'): Promise<string> {
  try {
    const rows = await db
      .select({ note: pipelineRetryNotes.note, contextTitle: pipelineRetryNotes.contextTitle, outcome: pipelineRetryNotes.outcome })
      .from(pipelineRetryNotes)
      .where(isNull(pipelineRetryNotes.deletedAt))
      .orderBy(desc(pipelineRetryNotes.createdAt))
      .limit(MAX_STRATEGIES_IN_PROMPT)
    if (rows.length === 0) return ''

    const lines = rows.map(
      (r) => `- ${r.note}${r.contextTitle ? ` (about "${r.contextTitle}")` : ''}${r.outcome ? ` → what was done: ${r.outcome}` : ''}`,
    )
    const intro =
      audience === 'extraction'
        ? 'Past reviewer corrections — mistakes this pipeline has made before on other events, which a person had to fix by hand. Avoid repeating them in what you extract now'
        : 'Past retry strategies — real corrections a person has had to ask for before, on other events, kept here so you can watch for the same kinds of problems without being asked again'
    return `\n\n${intro}:\n${lines.join('\n')}`
  } catch {
    // Same fail-open posture as every other Claude-backed check in this
    // pipeline — a strategies lookup failing must never block extraction or
    // a retry from running at all.
    return ''
  }
}
