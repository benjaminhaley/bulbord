import { useState } from 'react'

import { useRequireLogin } from '../auth/LoginPrompt'
import { clearSportsClubInterest, setSportsClubInterest, type InterestStatus, type SportsClub } from './api'

export function useSportsClubInterest(onChanged: (club: SportsClub) => void) {
  const [pending, setPending] = useState(false)
  const requireLogin = useRequireLogin()

  async function setInterest(club: SportsClub, status: InterestStatus) {
    if (!requireLogin('Sign in to mark clubs you’re interested in')) return
    setPending(true)
    try {
      await setSportsClubInterest(club.id, status)
      onChanged({ ...club, interest_status: status })
    } finally {
      setPending(false)
    }
  }

  async function clearInterest(club: SportsClub) {
    if (!requireLogin('Sign in to mark clubs you’re interested in')) return
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
