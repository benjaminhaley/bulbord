import { useState } from 'react'

import { starEvent, unstarEvent, type Event } from './api'

export function useStarToggle(onToggled: (event: Event) => void) {
  const [pending, setPending] = useState(false)

  async function toggleStar(event: Event) {
    setPending(true)
    try {
      if (event.starred) {
        await unstarEvent(event.id)
      } else {
        await starEvent(event.id)
      }
      onToggled({ ...event, starred: !event.starred })
    } finally {
      setPending(false)
    }
  }

  return { pending, toggleStar }
}
