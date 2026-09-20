import { describe, expect, it } from 'vitest'

import { scrubPeople } from './public-read.js'

describe('scrubPeople', () => {
  it('empties people fields at any depth but keeps counts', () => {
    const scrubbed = scrubPeople({
      data: [
        {
          title: 'Bike Bus',
          interested_count: 3,
          interested_people: [{ name: 'Sam', avatar_url: '/x.jpg' }],
          submitted_by: { name: 'Ann', avatar_url: null },
          can_edit: true,
          can_delete: true,
          interest_status: 'interested',
          starts_at: new Date('2026-09-20T00:00:00Z'),
        },
      ],
    })
    expect(scrubbed.data[0]).toMatchObject({
      title: 'Bike Bus',
      interested_count: 3,
      interested_people: [],
      submitted_by: null,
      can_edit: false,
      can_delete: false,
      interest_status: null,
    })
    expect(scrubbed.data[0].starts_at).toBeInstanceOf(Date)
    expect(JSON.stringify(scrubbed)).not.toContain('Sam')
    expect(JSON.stringify(scrubbed)).not.toContain('Ann')
  })
})
