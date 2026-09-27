// The in-app notification text for a single-source recheck (see
// POST /event-sources/:id/recheck). Pure, so every outcome is unit-tested.
export interface RecheckOutcome {
  added: number
  heldBack: number
  rejected: number
  unchanged?: boolean
  unreadable?: boolean
  error?: string
}

export function recheckNotificationMessage(sourceName: string, outcome: RecheckOutcome): string {
  const prefix = `Recheck of ${sourceName}:`
  if (outcome.error) return `${prefix} failed — ${outcome.error}`
  if (outcome.unreadable) return `${prefix} couldn't read the source page`
  if (outcome.unchanged) return `${prefix} page unchanged since the last check, nothing new`
  const parts = [`${outcome.added} added`]
  if (outcome.heldBack > 0) parts.push(`${outcome.heldBack} held back for fixes`)
  parts.push(`${outcome.rejected} rejected`)
  return `${prefix} ${parts.join(', ')} — tap to review`
}
