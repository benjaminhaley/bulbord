import { API_URL } from '../config'

// Shared plain avatar display — AccountPage, admin UsersPage, and JoinGate's
// "X invited you" screen all just need a round photo or nothing. The
// profile-setup photo *picker* (JoinGate's ProfileSetupScreen) stays separate
// since it's a different job (upload UI with a placeholder/spinner, not display).
export function Avatar({ url, size = 40, slot }: { url: string | null; size?: number; slot?: string }) {
  if (!url) return null
  return (
    <img
      slot={slot}
      src={`${API_URL}${url}`}
      alt=""
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
    />
  )
}
