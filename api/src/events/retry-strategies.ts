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
}): Promise<void> {
  const note = input.note.trim()
  if (!note) return
  await Promise.all([
    db.insert(pipelineRetryNotes).values({
      eventId: input.eventId ?? null,
      stage: input.stage,
      note,
      contextTitle: input.contextTitle ?? null,
      createdByUserId: input.userId,
    }),
    db.insert(eventsLog).values({
      actor: input.userId,
      action: 'pipeline_retry_note_added',
      metadata: { stage: input.stage, eventId: input.eventId ?? null, note },
    }),
  ])
}

// Formats the most recent notes as a block a retry prompt can append to its
// own system prompt — real corrections a person has had to ask for before,
// on other events, kept here so the pipeline can watch for the same kinds
// of problems without being asked again ("these should be strategies it
// pulls on itself to try to solve problems before giving up" — feedback
// #165). Returns '' (append is then a no-op) when there's nothing recorded
// yet, so every call site stays a plain string concatenation.
export async function getRetryStrategiesPromptBlock(): Promise<string> {
  try {
    const rows = await db
      .select({ note: pipelineRetryNotes.note, contextTitle: pipelineRetryNotes.contextTitle })
      .from(pipelineRetryNotes)
      .where(isNull(pipelineRetryNotes.deletedAt))
      .orderBy(desc(pipelineRetryNotes.createdAt))
      .limit(MAX_STRATEGIES_IN_PROMPT)
    if (rows.length === 0) return ''

    const lines = rows.map((r) => `- ${r.note}${r.contextTitle ? ` (from retrying "${r.contextTitle}")` : ''}`)
    return `\n\nPast retry strategies — real corrections a person has had to ask for before, on other events, kept here so you can watch for the same kinds of problems without being asked again:\n${lines.join('\n')}`
  } catch {
    // Same fail-open posture as every other Claude-backed check in this
    // pipeline — a strategies lookup failing must never block a retry from
    // running at all.
    return ''
  }
}
