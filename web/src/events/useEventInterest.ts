import { useState } from 'react'

import { clearEventInterest, setEventInterest, type Event, type InterestStatus } from './api'

// Shared with useLoginPrompt's requireLogin() at both call sites (EventsPage's
// swipe actions, EventDetailPage's star button) so the explanation for a given
// interest action only has one source of truth.
export const INTEREST_LOGIN_PROMPTS: Record<InterestStatus, string> = {
  interested: "Log in to star events you're interested in, so you can quickly find them again later.",
  dismissed: "Log in to dismiss events you don't want to see, so they stay out of your feed.",
}

export function useEventInterest(onChanged: (event: Event) => void) {
  const [pending, setPending] = useState(false)

  async function setInterest(event: Event, status: InterestStatus) {
    setPending(true)
    try {
      await setEventInterest(event.id, status)
      onChanged({ ...event, interest_status: status })
    } finally {
      setPending(false)
    }
  }

  async function clearInterest(event: Event) {
    setPending(true)
    try {
      await clearEventInterest(event.id)
      onChanged({ ...event, interest_status: null })
    } finally {
      setPending(false)
    }
  }

  return { pending, setInterest, clearInterest }
}
