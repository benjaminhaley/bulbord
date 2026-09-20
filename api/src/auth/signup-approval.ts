import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, userRoles, users } from '../db/schema.js'
import { requireEnv } from '../env.js'
import { sendEmail } from '../newsletter/mailer.js'
import { createNotification } from '../notifications/service.js'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function signupPendingSubject(name: string): string {
  return `${name} wants to join Nettelhorst Bulbord`
}

export function signupPendingHtml(
  applicant: { name: string; email: string | null; role: string | null; roleOther: string | null; avatarUrl: string | null },
  apiUrl: string,
  reviewUrl: string,
): string {
  const photo = applicant.avatarUrl
    ? `<img src="${apiUrl}${applicant.avatarUrl}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:50%;margin-bottom:12px;" alt="" />`
    : ''
  const role = applicant.role === 'other' && applicant.roleOther ? `other (${applicant.roleOther})` : (applicant.role ?? 'not given')
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
      ${photo}
      <p><strong>${escapeHtml(applicant.name)}</strong> just signed up and is waiting for your approval.</p>
      <p style="margin:0;">Email: ${escapeHtml(applicant.email ?? 'not given')}<br />Role: ${escapeHtml(role)}</p>
      <p><a href="${reviewUrl}" style="color:#2c2c2c;">Review and approve</a></p>
    </div>
  `
}

function signupApprovedHtml(name: string, webUrl: string): string {
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111111;font-size:16px;line-height:1.5;">
      <p>Hi ${escapeHtml(name)}, you're in — your Nettelhorst Bulbord account has been approved.</p>
      <p><a href="${webUrl}" style="color:#2c2c2c;">Open Nettelhorst Bulbord</a></p>
    </div>
  `
}

async function listAdmins() {
  return db
    .select({ id: users.id, email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'admin'), isNull(userRoles.deletedAt), isNull(users.deletedAt)))
}

// Fired once, when a pending applicant finishes the profile wizard (not at
// bare passkey registration, when the account is still named "New Nettelhorst
// member" with no email/photo — nothing yet to judge them by). One in-app
// notification plus one email per admin; not toggleable, since it's an
// action-required alert rather than a preference-driven digest (feedback
// #175). Best-effort per admin so one bad address can't block the rest.
export async function notifyAdminsOfPendingSignup(applicantId: string) {
  const [applicant] = await db
    .select({ name: users.name, email: users.email, role: users.role, roleOther: users.roleOther, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, applicantId))
    .limit(1)
  if (!applicant) return

  const admins = await listAdmins()
  const apiUrl = requireEnv('PUBLIC_API_URL')
  const webUrl = requireEnv('PUBLIC_WEB_URL')
  await Promise.allSettled(
    admins.map(async (admin) => {
      await createNotification({
        userId: admin.id,
        type: 'signup_pending',
        actorUserId: applicantId,
        message: `${applicant.name} signed up and needs approval`,
        targetPath: '/admin/users',
      })
      if (admin.email) {
        await sendEmail(
          admin.email,
          signupPendingSubject(applicant.name),
          signupPendingHtml(applicant, apiUrl, `${webUrl}/admin/users`),
        )
      }
    }),
  )
}

export async function approveMember(targetUserId: string, actingAdminId: string) {
  const [target] = await db
    .select({ id: users.id, name: users.name, email: users.email, approvedAt: users.approvedAt })
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1)
  if (!target) return { error: 'not_found' as const }
  if (target.approvedAt) return { ok: true as const, alreadyApproved: true }

  await db.update(users).set({ approvedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, targetUserId))
  await db.insert(eventsLog).values({
    actor: actingAdminId,
    action: 'user_approved',
    metadata: { targetUserId, targetName: target.name },
  })

  if (target.email) {
    // Best-effort: the approval itself already committed.
    sendEmail(target.email, "You're approved on Nettelhorst Bulbord", signupApprovedHtml(target.name, requireEnv('PUBLIC_WEB_URL'))).catch(() => {})
  }
  return { ok: true as const, alreadyApproved: false }
}
