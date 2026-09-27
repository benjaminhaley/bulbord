import { describe, expect, it } from 'vitest'

import { recheckNotificationMessage } from './recheck-message.js'

describe('recheckNotificationMessage', () => {
  const base = { added: 0, heldBack: 0, rejected: 0 }

  it('summarizes added and rejected counts', () => {
    expect(recheckNotificationMessage('Lincoln Park Zoo', { ...base, added: 4, rejected: 1 })).toBe(
      'Recheck of Lincoln Park Zoo: 4 added, 1 rejected — tap to review',
    )
  })

  it('calls out events held back by a failing check', () => {
    expect(recheckNotificationMessage('Zoo', { ...base, added: 3, heldBack: 1, rejected: 0 })).toBe(
      'Recheck of Zoo: 3 added, 1 held back for fixes, 0 rejected — tap to review',
    )
  })

  it('explains an unchanged page, an unreadable page, and an error', () => {
    expect(recheckNotificationMessage('Zoo', { ...base, unchanged: true })).toBe('Recheck of Zoo: page unchanged since the last check, nothing new')
    expect(recheckNotificationMessage('Zoo', { ...base, unreadable: true })).toBe("Recheck of Zoo: couldn't read the source page")
    expect(recheckNotificationMessage('Zoo', { ...base, error: 'boom' })).toBe('Recheck of Zoo: failed — boom')
  })
})
