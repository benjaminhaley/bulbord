import { randomBytes, randomUUID } from 'node:crypto'

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { eventsLog, passkeyCredentials, users } from '../db/schema.js'
import { createSession } from './service.js'
import { secretsMatch, signJson, verifyJson } from './tokens.js'

// How long a registration/login ceremony has to complete once options are
// generated — generous enough for a real Face ID prompt, short enough that a
// leaked challengeToken is useless shortly after.
const CHALLENGE_TTL_MS = 5 * 60 * 1000

export interface WebAuthnEnv {
  rpId: string
  rpName: string
  origins: string[]
  rootInviteSecret: string | null
  sessionSecret: string
}

function readEnv(): WebAuthnEnv {
  const rpId = process.env.WEBAUTHN_RP_ID
  const rpName = process.env.WEBAUTHN_RP_NAME
  const origin = process.env.WEBAUTHN_ORIGIN
  const sessionSecret = process.env.SESSION_SECRET
  if (!rpId || !rpName || !origin || !sessionSecret) {
    throw new Error(
      'Missing WebAuthn env vars: WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, WEBAUTHN_ORIGIN, SESSION_SECRET are all required',
    )
  }
  return {
    rpId,
    rpName,
    origins: origin.split(',').map((o) => o.trim()),
    rootInviteSecret: process.env.ROOT_INVITE_SECRET || null,
    sessionSecret,
  }
}

function isFresh(issuedAt: number): boolean {
  const age = Date.now() - issuedAt
  return age >= 0 && age <= CHALLENGE_TTL_MS
}

interface RegisterChallengePayload {
  kind: 'register'
  challenge: string
  newUserId: string
  inviterUserId: string | null
  issuedAt: number
}

interface LoginChallengePayload {
  kind: 'login'
  challenge: string
  issuedAt: number
}

export type InvitationResolution = { ok: true; inviterUserId: string | null } | { ok: false; message: string }

// The only place "you need an invitation to join Nettlehorst" is enforced — see
// CLAUDE.md's Login section. Resolved once here, at options-generation time,
// then signed into the challenge token so /verify trusts the signature rather
// than re-validating client-supplied ids (no TOCTOU gap between the calls).
// Exported directly (rather than only indirectly via createRegistrationOptions)
// so it can be unit-tested without generating a full WebAuthn ceremony.
export async function resolveInvitation(
  env: WebAuthnEnv,
  input: { inviterUserId?: string; rootSecret?: string },
): Promise<InvitationResolution> {
  if (input.rootSecret) {
    if (!env.rootInviteSecret || !secretsMatch(input.rootSecret, env.rootInviteSecret)) {
      return { ok: false, message: 'Invalid root invite secret' }
    }
    return { ok: true, inviterUserId: null }
  }

  if (input.inviterUserId) {
    const [inviter] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.inviterUserId), isNull(users.deletedAt)))
      .limit(1)
    if (!inviter) return { ok: false, message: 'Invalid invite link' }
    return { ok: true, inviterUserId: inviter.id }
  }

  return { ok: false, message: 'An invitation is required to join Nettlehorst' }
}

export async function createRegistrationOptions(input: { inviterUserId?: string; rootSecret?: string }) {
  const env = readEnv()
  const resolution = await resolveInvitation(env, input)
  if (!resolution.ok) return { ok: false as const, message: resolution.message }

  // A random opaque handle for the authenticator's own bookkeeping — distinct
  // from `newUserId` (the real future users.id), since WebAuthn's userID has
  // no reason to carry meaning beyond "unique per account on this RP".
  const webauthnUserId = randomBytes(32)
  const newUserId = randomUUID()

  const options = await generateRegistrationOptions({
    rpName: env.rpName,
    rpID: env.rpId,
    userID: webauthnUserId,
    // Placeholder — the real name is collected in the post-registration
    // profile step (see updateProfile in service.ts). Known limitation: the
    // OS/authenticator's own passkey label (shown in account pickers on
    // shared devices) stays generic forever, since WebAuthn has no API to
    // rename a credential after creation.
    userName: 'New Nettlehorst member',
    userDisplayName: 'New Nettlehorst member',
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })

  const payload: RegisterChallengePayload = {
    kind: 'register',
    challenge: options.challenge,
    newUserId,
    inviterUserId: resolution.inviterUserId,
    issuedAt: Date.now(),
  }

  return { ok: true as const, options, challengeToken: signJson(payload, env.sessionSecret) }
}

export async function verifyRegistration(input: { response: RegistrationResponseJSON; challengeToken: string }) {
  const env = readEnv()
  const payload = verifyJson<RegisterChallengePayload>(input.challengeToken, env.sessionSecret)
  if (!payload || payload.kind !== 'register' || !isFresh(payload.issuedAt)) {
    return { ok: false as const, message: 'This registration attempt expired. Please try again.' }
  }

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: payload.challenge,
    expectedOrigin: env.origins,
    expectedRPID: env.rpId,
  })
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false as const, message: 'Could not verify passkey registration.' }
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const transports = (input.response.response as { transports?: string[] }).transports ?? null

  const [user] = await db
    .insert(users)
    .values({ id: payload.newUserId, name: 'New Nettlehorst member', invitedByUserId: payload.inviterUserId })
    .returning()

  // Independent writes — none reads another's result — so they run concurrently.
  const [, , { token }] = await Promise.all([
    db.insert(passkeyCredentials).values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports,
    }),
    db.insert(eventsLog).values([
      { actor: user.id, action: 'user_created', metadata: { invitedByUserId: payload.inviterUserId } },
      { actor: user.id, action: 'passkey_registered', metadata: { credentialId: credential.id } },
    ]),
    createSession(user.id),
  ])
  return { ok: true as const, token, user }
}

export async function createAuthenticationOptions() {
  const env = readEnv()

  // No `allowCredentials` — a discoverable-credential ("resident key") flow,
  // so the OS shows an account picker across whichever passkeys it has for
  // this RP ID rather than us needing to know who's signing in beforehand.
  const options = await generateAuthenticationOptions({ rpID: env.rpId, userVerification: 'required' })

  const payload: LoginChallengePayload = { kind: 'login', challenge: options.challenge, issuedAt: Date.now() }
  return { options, challengeToken: signJson(payload, env.sessionSecret) }
}

export async function verifyAuthentication(input: { response: AuthenticationResponseJSON; challengeToken: string }) {
  const env = readEnv()
  const payload = verifyJson<LoginChallengePayload>(input.challengeToken, env.sessionSecret)
  if (!payload || payload.kind !== 'login' || !isFresh(payload.issuedAt)) {
    return { ok: false as const, message: 'This sign-in attempt expired. Please try again.' }
  }

  const [stored] = await db
    .select({ credential: passkeyCredentials, user: users })
    .from(passkeyCredentials)
    .innerJoin(users, eq(users.id, passkeyCredentials.userId))
    .where(
      and(
        eq(passkeyCredentials.credentialId, input.response.id),
        isNull(passkeyCredentials.deletedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1)

  if (!stored) {
    return { ok: false as const, message: 'Passkey not recognized.' }
  }

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: payload.challenge,
    expectedOrigin: env.origins,
    expectedRPID: env.rpId,
    credential: {
      id: stored.credential.credentialId,
      publicKey: isoBase64URL.toBuffer(stored.credential.publicKey),
      counter: stored.credential.counter,
    },
  })
  if (!verification.verified) {
    return { ok: false as const, message: 'Could not verify passkey sign-in.' }
  }

  const [, { token }] = await Promise.all([
    db
      .update(passkeyCredentials)
      .set({ counter: verification.authenticationInfo.newCounter, updatedAt: new Date() })
      .where(eq(passkeyCredentials.id, stored.credential.id)),
    createSession(stored.user.id),
  ])
  return { ok: true as const, token, user: stored.user }
}
