import { API_URL } from '../config'

// "Anna Piepmeyer" -> "AP", "Ben" -> "B" (feedback #42).
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

// Shared plain avatar display — AccountPage, admin UsersPage, and JoinGate's
// "X invited you" screen all just need a round photo or initials. The
// profile-setup photo *picker* (JoinGate's ProfileSetupScreen) stays separate
// since it's a different job (upload UI with a placeholder/spinner, not display).
export function Avatar({ url, name, size = 40, slot }: { url: string | null; name?: string; size?: number; slot?: string }) {
  if (!url) {
    if (!name) return null
    return (
      <div
        slot={slot}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--ion-color-medium)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {getInitials(name)}
      </div>
    )
  }
  return (
    <img
      slot={slot}
      src={`${API_URL}${url}`}
      alt=""
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  )
}
