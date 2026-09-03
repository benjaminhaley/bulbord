import { describe, expect, it } from 'vitest'

import { buildSuggestionList, deriveConnectionsState, type ConnectionEdge } from './logic.js'
import type { MemberSummary } from './service.js'

function member(id: string, name = id): MemberSummary {
  return { id, name, avatarUrl: null }
}

function edge(id: string, status: 'pending' | 'accepted', connectionId = `c-${id}`): ConnectionEdge {
  return { connectionId, status, member: member(id) }
}

describe('deriveConnectionsState', () => {
  it('puts an accepted outgoing edge in friends', () => {
    const result = deriveConnectionsState([edge('a', 'accepted')], [])
    expect(result).toEqual({ friends: [member('a')], sentRequests: [], receivedRequests: [] })
  })

  it('puts an accepted incoming edge in friends too', () => {
    const result = deriveConnectionsState([], [edge('a', 'accepted')])
    expect(result).toEqual({ friends: [member('a')], sentRequests: [], receivedRequests: [] })
  })

  it('puts a pending request I sent into sentRequests', () => {
    const result = deriveConnectionsState([edge('a', 'pending')], [])
    expect(result).toEqual({ friends: [], sentRequests: [member('a')], receivedRequests: [] })
  })

  it('puts a pending request someone sent me into receivedRequests, with its connectionId', () => {
    const result = deriveConnectionsState([], [edge('a', 'pending', 'conn-123')])
    expect(result).toEqual({
      friends: [],
      sentRequests: [],
      receivedRequests: [{ id: 'a', name: 'a', avatarUrl: null, connectionId: 'conn-123' }],
    })
  })

  it('splits a mixed set correctly', () => {
    const result = deriveConnectionsState(
      [edge('friend-out', 'accepted'), edge('sent', 'pending')],
      [edge('friend-in', 'accepted'), edge('received', 'pending')],
    )
    expect(result.friends).toEqual([member('friend-out'), member('friend-in')])
    expect(result.sentRequests).toEqual([member('sent')])
    expect(result.receivedRequests).toEqual([{ id: 'received', name: 'received', avatarUrl: null, connectionId: 'c-received' }])
  })

  it('returns empty buckets with no connections either way', () => {
    expect(deriveConnectionsState([], [])).toEqual({ friends: [], sentRequests: [], receivedRequests: [] })
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
