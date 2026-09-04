import { useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import { clearEventInterest, setEventInterest, type Event, type InterestStatus } from './api'

// Feedback #145 (2026-09-04): marking (or clearing) interest used to only
// patch interest_status locally — interested_count/interested_people (the
// "N interested: ..." stack of avatars) stayed stale until the next real
// fetch, so a member swiping/tapping interested didn't see themselves show
// up with their own picture until they left the screen and came back.
// interested_people already carries the viewer's own name pre-substituted
// with "You" server-side (see Event.interested_people's own doc comment in
// api.ts), so an optimistic update can add/remove exactly that placeholder
// without needing to know the real underlying row.
function withOptimisticInterest(event: Event, status: InterestStatus | null, viewerAvatarUrl: string | null): Event {
  const wasInterested = event.interest_status === 'interested'
  const isInterested = status === 'interested'
  if (wasInterested === isInterested) return { ...event, interest_status: status }

  if (isInterested) {
    return {
      ...event,
      interest_status: status,
      interested_count: event.interested_count + 1,
      interested_people: [...event.interested_people, { name: 'You', avatar_url: viewerAvatarUrl }],
    }
  }

  return {
    ...event,
    interest_status: status,
    interested_count: Math.max(0, event.interested_count - 1),
    interested_people: event.interested_people.filter((person) => person.name !== 'You'),
  }
}

export function useEventInterest(onChanged: (event: Event) => void) {
  const { user } = useAuth()
  const [pending, setPending] = useState(false)

  async function setInterest(event: Event, status: InterestStatus) {
    setPending(true)
    try {
      await setEventInterest(event.id, status)
      onChanged(withOptimisticInterest(event, status, user?.avatarUrl ?? null))
    } finally {
      setPending(false)
    }
  }

  async function clearInterest(event: Event) {
    setPending(true)
    try {
      await clearEventInterest(event.id)
      onChanged(withOptimisticInterest(event, null, user?.avatarUrl ?? null))
    } finally {
      setPending(false)
    }
  }

  return { pending, setInterest, clearInterest }
}
