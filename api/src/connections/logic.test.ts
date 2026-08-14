import { describe, expect, it } from 'vitest'

import { buildSuggestionList, deriveConnectionsState } from './logic.js'
import type { MemberSummary } from './service.js'

function member(id: string, name = id): MemberSummary {
  return { id, name, avatarUrl: null }
}

describe('deriveConnectionsState', () => {
  it('puts a mutual pair in friends, not following/followers', () => {
    const result = deriveConnectionsState([member('a')], [member('a')])
    expect(result).toEqual({ friends: [member('a')], following: [], followers: [] })
  })

  it('puts a one-directional add I made into following', () => {
    const result = deriveConnectionsState([member('a')], [])
    expect(result).toEqual({ friends: [], following: [member('a')], followers: [] })
  })

  it('puts someone who added me (and I have not added back) into followers', () => {
    const result = deriveConnectionsState([], [member('a')])
    expect(result).toEqual({ friends: [], following: [], followers: [member('a')] })
  })

  it('splits a mixed set correctly', () => {
    const result = deriveConnectionsState([member('mutual'), member('following-only')], [member('mutual'), member('follower-only')])
    expect(result).toEqual({
      friends: [member('mutual')],
      following: [member('following-only')],
      followers: [member('follower-only')],
    })
  })

  it('returns empty buckets with no connections either way', () => {
    expect(deriveConnectionsState([], [])).toEqual({ friends: [], following: [], followers: [] })
  })
})

describe('buildSuggestionList', () => {
  it('flattens groups in priority order', () => {
    const result = buildSuggestionList('viewer', [[member('inviter')], [member('inviter-friend')], [member('grade-match')]], [])
    expect(result.map((m) => m.id)).toEqual(['inviter', 'inviter-friend', 'grade-match'])
  })

  it('excludes the viewer themselves even if somehow present in a group', () => {
    const result = buildSuggestionList('viewer', [[member('viewer'), member('other')]], [])
    expect(result.map((m) => m.id)).toEqual(['other'])
  })

  it('excludes already-connected members', () => {
    const result = buildSuggestionList('viewer', [[member('a'), member('b')]], ['a'])
    expect(result.map((m) => m.id)).toEqual(['b'])
  })

  it('dedupes a candidate that appears in more than one group, keeping the earliest position', () => {
    const result = buildSuggestionList('viewer', [[member('a')], [member('a'), member('b')]], [])
    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('returns an empty list when every candidate is excluded', () => {
    const result = buildSuggestionList('viewer', [[member('a')]], ['a'])
    expect(result).toEqual([])
  })
})
