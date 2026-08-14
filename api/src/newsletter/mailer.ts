import { Resend } from 'resend'

import { requireEnv } from '../env.js'

// Module-level client construction, mirroring the S3 client setup in
// uploads/storage.ts — throws at module load if the required env vars are
// missing, rather than failing lazily on first send.
const fromEmail = requireEnv('RESEND_FROM_EMAIL')
const client = new Resend(requireEnv('RESEND_API_KEY'))

// Generic transactional-email sender — used by the weekly newsletter and, as
// of feedback #83, the connections feature's "X added you as a friend"
// alert. Reuses this module's single Resend client rather than a second one,
// same "share code, don't duplicate infra" posture as the rest of this app.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const { error } = await client.emails.send({ from: fromEmail, to, subject, html })
  if (error) {
    throw new Error(`Resend send to ${to} failed: ${error.message}`)
  }
}
