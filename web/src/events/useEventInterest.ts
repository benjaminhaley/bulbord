import { useState } from 'react'

import { clearEventInterest, setEventInterest, type Event, type InterestStatus } from './api'

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
