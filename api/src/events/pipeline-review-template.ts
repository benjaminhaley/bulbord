// Pure render logic for the pipeline-review email — split out of
// pipeline-review-email.ts the same way camp-reminders/template.ts is split
// from camp-reminders/service.ts, so these functions can be unit-tested
// without pulling in db/client.ts (which reads DATABASE_URL at import time).
import type { KeptReviewItem, RejectedReviewItem } from './pipeline-review-service.js'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const MAX_EXAMPLES = 5

export function pipelineReviewSubject(runDate: Date, kept: number, rejected: number, prefix = ''): string {
  const dateLabel = runDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
  return `${prefix}Pipeline Review: ${kept} added, ${rejected} rejected — ${dateLabel}`
}

function exampleListHtml(lines: string[]): string {
  if (lines.length === 0) return ''
  return `<ul style="margin:8px 0 0;padding-left:20px;color:#444444;font-size:14px;">${lines.map((l) => `<li style="margin-bottom:4px;">${l}</li>`).join('')}</ul>`
}

export function renderPipelineReviewHtml(options: {
  runDate: Date
  kept: KeptReviewItem[]
  rejected: RejectedReviewItem[]
  webUrl: string
}): string {
  const { runDate, kept, rejected } = options
  const dateLabel = runDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
  const relevanceRejected = rejected.filter((r) => r.rejectionType === 'relevance')
  const duplicateRejected = rejected.filter((r) => r.rejectionType === 'duplicate')

  const keptExamples = exampleListHtml(
    kept.slice(0, MAX_EXAMPLES).map((k) => `<strong>${escapeHtml(k.title)}</strong>${k.relevanceReason ? ` — ${escapeHtml(k.relevanceReason)}` : ''}`),
  )
  const rejectedExamples = exampleListHtml(
    [...relevanceRejected, ...duplicateRejected]
      .slice(0, MAX_EXAMPLES)
      .map((r) => `<strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.rejectionReason)}`),
  )

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#2c2c2c;padding:14px 24px;">
                <span style="font-size:16px;font-weight:600;color:#ffffff;">Bulbord Pipeline Review</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px;">
                <p style="color:#111111;font-size:16px;margin:0;">The event-sourcing pipeline ran ${escapeHtml(dateLabel)}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0;">
                <p style="color:#111111;font-size:15px;margin:0;"><strong>${kept.length}</strong> event${kept.length === 1 ? '' : 's'} added</p>
                ${keptExamples}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 0;">
                <p style="color:#111111;font-size:15px;margin:0;"><strong>${rejected.length}</strong> candidate${rejected.length === 1 ? '' : 's'} rejected (${relevanceRejected.length} not relevant, ${duplicateRejected.length} duplicate)</p>
                ${rejectedExamples}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;text-align:center;">
                <a href="${options.webUrl}/admin/pipeline-review" style="display:inline-block;background:#111111;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Review this run</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
