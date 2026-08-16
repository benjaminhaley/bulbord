import { API_URL } from '../config'
import { authHeaders } from '../auth/token'

export type TrackableAction = 'app_opened' | 'event_viewed' | 'camp_viewed' | 'share_opened'

// Fire-and-forget telemetry for feedback #96's admin analytics page — every
// call site swallows its own failure (see each caller), since a logging
// call should never block or error the actual feature (viewing an event,
// opening the share modal).
export async function track(action: TrackableAction, metadata?: Record<string, unknown>): Promise<void> {
  await fetch(`${API_URL}/analytics/track`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, metadata }),
  })
}
