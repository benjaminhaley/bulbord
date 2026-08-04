import { useState } from 'react'

import { clearCampInterest, setCampInterest, type Camp, type InterestStatus } from './api'

export function useCampInterest(onChanged: (camp: Camp) => void) {
  const [pending, setPending] = useState(false)

  async function setInterest(camp: Camp, status: InterestStatus) {
    setPending(true)
    try {
      await setCampInterest(camp.id, status)
      onChanged({ ...camp, interest_status: status })
    } finally {
      setPending(false)
    }
  }

  async function clearInterest(camp: Camp) {
    setPending(true)
    try {
      await clearCampInterest(camp.id)
      onChanged({ ...camp, interest_status: null })
    } finally {
      setPending(false)
    }
  }

  return { pending, setInterest, clearInterest }
}
