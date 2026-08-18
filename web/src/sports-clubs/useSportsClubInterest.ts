import { useState } from 'react'

import { clearSportsClubInterest, setSportsClubInterest, type InterestStatus, type SportsClub } from './api'

export function useSportsClubInterest(onChanged: (club: SportsClub) => void) {
  const [pending, setPending] = useState(false)

  async function setInterest(club: SportsClub, status: InterestStatus) {
    setPending(true)
    try {
      await setSportsClubInterest(club.id, status)
      onChanged({ ...club, interest_status: status })
    } finally {
      setPending(false)
    }
  }

  async function clearInterest(club: SportsClub) {
    setPending(true)
    try {
      await clearSportsClubInterest(club.id)
      onChanged({ ...club, interest_status: null })
    } finally {
      setPending(false)
    }
  }

  return { pending, setInterest, clearInterest }
}
