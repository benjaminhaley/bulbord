import { createUnsubscribeToken } from '../newsletter/service.js'
import { sendEmail } from '../newsletter/mailer.js'
import { requireEnv } from '../env.js'
import { todayInChicago } from '../dates.js'
import { getCampsForDateRange, getCandidateBreaks } from './query.js'
import { campReminderSubject, formatReminderCamps, renderCampReminderHtml } from './template.js'

// Admin dev tool (feedback #120: "as with the weekly reminder email, it
// should be easy for me as an administrator to send myself a test copy").
// Deliberately ignores the real due-date gate (window.ts's isReminderDue)
// and school_breaks.remindedAt — an admin previewing the render shouldn't
// have to wait for the actual 28-day mark, and a preview send must never
// mark the real break as reminded (that would suppress the live send later).
// Picks the soonest upcoming non-summer break that currently has at least
// one camp listed, same "has real camps" requirement the live send applies.
export async function sendTestCampReminderEmail(
  recipient: { id: string; name: string; email: string },
): Promise<'sent' | 'no_upcoming_camps'> {
  const candidates = await getCandidateBreaks(todayInChicago())
  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')

  for (const candidate of candidates) {
    const camps = formatReminderCamps(await getCampsForDateRange(candidate.startDate, candidate.endDate))
    if (camps.length === 0) continue

    const html = renderCampReminderHtml({
      camps,
      breakName: candidate.name,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      recipient: { id: recipient.id, name: recipient.name },
      apiUrl,
      webUrl,
      unsubscribeUrl: `${apiUrl}/newsletter/unsubscribe?token=${createUnsubscribeToken(recipient.id)}`,
    })
    await sendEmail(recipient.email, campReminderSubject(candidate.startDate, candidate.endDate, '[Test] '), html)
    return 'sent'
  }

  return 'no_upcoming_camps'
}
