// Feedback 2026-09-27: the Sources table's "Checked" column — has this
// source been checked by event sourcing (weekly run or a single recheck) in
// the last 7 days? Red when not. Pure, so it's unit-tested.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface CheckedCell {
  label: string
  stale: boolean
}

interface CheckableSource {
  is_active: boolean
  last_checked_at: string | null
  type: string
}

// "today", "3d", or "never" for one source — last_checked_at only moves on a
// successful check. Inactive and email-fed sources aren't checked by design,
// so they show "off"/"email" and are never red.
export function sourceCheckedCell(source: CheckableSource, now: Date): CheckedCell {
  if (!source.is_active) return { label: 'off', stale: false }
  // Fed by inbound email, never scraped — see resourcing.ts.
  if (source.type === 'email') return { label: 'email', stale: false }
  if (!source.last_checked_at) return { label: 'never', stale: true }
  const ageMs = now.getTime() - new Date(source.last_checked_at).getTime()
  const days = Math.floor(ageMs / DAY_MS)
  return { label: days <= 0 ? 'today' : `${days}d`, stale: ageMs > WEEK_MS }
}

// A domain row reports its least-recently-checked active source, so one
// stale source is enough to turn the row red.
export function domainCheckedCell(sources: CheckableSource[], now: Date): CheckedCell {
  const active = sources.filter((s) => s.is_active && s.type !== 'email')
  if (active.length === 0) return sources.some((s) => s.is_active) ? { label: 'email', stale: false } : { label: 'off', stale: false }
  if (active.some((s) => !s.last_checked_at)) return { label: 'never', stale: true }
  const oldest = active.reduce((a, b) => (new Date(a.last_checked_at!) < new Date(b.last_checked_at!) ? a : b))
  return sourceCheckedCell(oldest, now)
}
