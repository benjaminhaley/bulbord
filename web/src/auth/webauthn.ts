import { Capacitor } from '@capacitor/core'
import { CapacitorPasskey } from '@capgo/capacitor-passkey'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { API_URL } from '../config'
import { readErrorMessage } from './http'

interface RegisterOptionsResponse {
  data: { options: PublicKeyCredentialCreationOptionsJSON; challengeToken: string }
}

interface LoginOptionsResponse {
  data: { options: PublicKeyCredentialRequestOptionsJSON; challengeToken: string }
}

interface TokenResponse {
  data: { token: string }
}

let nativeShimReady: Promise<unknown> | null = null

// Routes navigator.credentials.create/get to native passkey APIs when running
// in the wrapped iOS/Android app — see capacitor.config.ts and CLAUDE.md's
// Platform strategy. Lazily installed once, only on native: the plugin's web
// implementation isn't a transparent passthrough to the browser's own
// WebAuthn — installing it unconditionally broke registration in a plain
// browser (confirmed locally: the ceremony hung indefinitely instead of
// reaching a real authenticator). Callers below don't need to know any of
// this — they just call registerPasskey/loginWithPasskey either way.
function ensureNativeShim(): Promise<unknown> {
  nativeShimReady ??= Capacitor.isNativePlatform() ? CapacitorPasskey.autoShimWebAuthn() : Promise.resolve()
  return nativeShimReady
}

// Registers a new passkey, gated on either an inviter (from the ShareButton's
// `?invite=<user id>` link) or the ROOT_INVITE_SECRET bootstrap — see
// CLAUDE.md's Login section. Returns the new session token.
export async function registerPasskey(invite: { inviterUserId?: string; rootSecret?: string }): Promise<string> {
  await ensureNativeShim()

  const optionsResponse = await fetch(`${API_URL}/auth/webauthn/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invite),
  })
  if (!optionsResponse.ok) {
    throw new Error(await readErrorMessage(optionsResponse, 'Could not start registration'))
  }
  const { data } = (await optionsResponse.json()) as RegisterOptionsResponse

  const attestationResponse = await startRegistration({ optionsJSON: data.options })

  const verifyResponse = await fetch(`${API_URL}/auth/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: attestationResponse, challengeToken: data.challengeToken }),
  })
  if (!verifyResponse.ok) {
    throw new Error(await readErrorMessage(verifyResponse, 'Could not verify passkey'))
  }
  const { data: verified } = (await verifyResponse.json()) as TokenResponse
  return verified.token
}

// Signs in with an existing passkey (discoverable credential — the OS shows
// an account picker rather than us needing to know who's signing in first).
// Returns the new session token.
export async function loginWithPasskey(): Promise<string> {
  await ensureNativeShim()

  const optionsResponse = await fetch(`${API_URL}/auth/webauthn/login/options`, { method: 'POST' })
  if (!optionsResponse.ok) {
    throw new Error(await readErrorMessage(optionsResponse, 'Could not start sign-in'))
  }
  const { data } = (await optionsResponse.json()) as LoginOptionsResponse

  const assertionResponse = await startAuthentication({ optionsJSON: data.options })

  const verifyResponse = await fetch(`${API_URL}/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: assertionResponse, challengeToken: data.challengeToken }),
  })
  if (!verifyResponse.ok) {
    throw new Error(await readErrorMessage(verifyResponse, 'Could not verify sign-in'))
  }
  const { data: verified } = (await verifyResponse.json()) as TokenResponse
  return verified.token
}
