import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

import { API_URL } from '../config'

// Web-only for now — Phase 4 (Capacitor) adds a branch here that delegates to
// a native Credential Manager bridge on Android, since Android's WebView has
// no built-in WebAuthn support (iOS's WKWebView works directly once
// Associated Domains is configured, so it doesn't need one).

interface RegisterOptionsResponse {
  data: { options: PublicKeyCredentialCreationOptionsJSON; challengeToken: string }
}

interface LoginOptionsResponse {
  data: { options: PublicKeyCredentialRequestOptionsJSON; challengeToken: string }
}

interface TokenResponse {
  data: { token: string }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message: string } } | null
  return body?.error?.message ?? fallback
}

// Registers a new passkey, gated on either an inviter (from the ShareButton's
// `?invite=<user id>` link) or the ROOT_INVITE_SECRET bootstrap — see
// CLAUDE.md's Login section. Returns the new session token.
export async function registerPasskey(invite: { inviterUserId?: string; rootSecret?: string }): Promise<string> {
  const optionsResponse = await fetch(`${API_URL}/auth/webauthn/register/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invite),
  })
  if (!optionsResponse.ok) {
    throw new Error(await readError(optionsResponse, 'Could not start registration'))
  }
  const { data } = (await optionsResponse.json()) as RegisterOptionsResponse

  const attestationResponse = await startRegistration({ optionsJSON: data.options })

  const verifyResponse = await fetch(`${API_URL}/auth/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: attestationResponse, challengeToken: data.challengeToken }),
  })
  if (!verifyResponse.ok) {
    throw new Error(await readError(verifyResponse, 'Could not verify passkey'))
  }
  const { data: verified } = (await verifyResponse.json()) as TokenResponse
  return verified.token
}

// Signs in with an existing passkey (discoverable credential — the OS shows
// an account picker rather than us needing to know who's signing in first).
// Returns the new session token.
export async function loginWithPasskey(): Promise<string> {
  const optionsResponse = await fetch(`${API_URL}/auth/webauthn/login/options`, { method: 'POST' })
  if (!optionsResponse.ok) {
    throw new Error(await readError(optionsResponse, 'Could not start sign-in'))
  }
  const { data } = (await optionsResponse.json()) as LoginOptionsResponse

  const assertionResponse = await startAuthentication({ optionsJSON: data.options })

  const verifyResponse = await fetch(`${API_URL}/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: assertionResponse, challengeToken: data.challengeToken }),
  })
  if (!verifyResponse.ok) {
    throw new Error(await readError(verifyResponse, 'Could not verify sign-in'))
  }
  const { data: verified } = (await verifyResponse.json()) as TokenResponse
  return verified.token
}
