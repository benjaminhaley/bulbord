import type { FastifyReply } from 'fastify'

import { createNotification, type NotificationType } from '../notifications/service.js'
import type { PipelineReviewActionError, RetryResult } from './pipeline-review-service.js'

// How long a Retry waits before answering "still working" and delivering the
// result as a notification instead — well under Railway's 5-minute limit.
const RETRY_WAIT_MS = 90_000

// Acting on a note can take many minutes (a split runs a web search, then a
// photo search per new event) — past Railway's 5-minute request limit, which
// answered with a bare "upstream error" while the work quietly finished
// (2026-09-28). So wait a bounded time; if it's still going, answer "still
// working" and send the result as a notification. Shared by Pipeline
// Review's Retry and an event page's "Retry with note" (feedback #186).
export async function sendRetryResult(
  reply: FastifyReply,
  work: Promise<PipelineReviewActionError | RetryResult>,
  notify: { userId: string; type: NotificationType; targetPath: string },
) {
  const settled = await Promise.race([work, new Promise<'still_running'>((resolve) => setTimeout(() => resolve('still_running'), RETRY_WAIT_MS))])
  if (settled === 'still_running') {
    void work
      .then((result) =>
        result === 'not_found'
          ? undefined
          : createNotification({
              ...notify,
              actorUserId: null,
              message: result.noteOutcome
                ? `Retry note ${result.noteOutcome.handled ? 'done' : "couldn't be done"}: ${result.noteOutcome.message}`
                : `Retry finished: ${result.allPassing ? 'all checks pass' : 'some checks still fail'}.`,
            }),
      )
      .catch((err: unknown) =>
        createNotification({
          ...notify,
          actorUserId: null,
          message: `Retry failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        }),
      )
    return reply.send({ data: { still_running: true } })
  }
  const result = settled
  if (result === 'not_found') return reply.code(404).send({ error: { message: 'Event not found' } })
  return reply.send({
    data: {
      all_passing: result.allPassing,
      image_retried: result.imageRetried,
      image_changed: result.imageChanged,
      image_reason: result.imageReason,
      note_outcome: result.noteOutcome,
    },
  })
}
