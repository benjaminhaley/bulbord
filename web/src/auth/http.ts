// Shared by web/src/auth/api.ts and web/src/auth/webauthn.ts — this app's
// one error-object shape (see CLAUDE.md's API conventions) always puts the
// message at `error.message`.
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message: string } } | null
  return body?.error?.message ?? fallback
}
