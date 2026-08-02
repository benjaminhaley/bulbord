import { Resend } from 'resend'

import { requireEnv } from '../env.js'

// Module-level client construction, mirroring the S3 client setup in
// uploads/storage.ts — throws at module load if the required env vars are
// missing, rather than failing lazily on first send.
const fromEmail = requireEnv('RESEND_FROM_EMAIL')
const client = new Resend(requireEnv('RESEND_API_KEY'))

export async function sendNewsletterEmail(to: string, subject: string, html: string): Promise<void> {
  const { error } = await client.emails.send({ from: fromEmail, to, subject, html })
  if (error) {
    throw new Error(`Resend send to ${to} failed: ${error.message}`)
  }
}
