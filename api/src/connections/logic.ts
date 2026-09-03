import type { MemberSummary } from './service.js'

// One row per (requester, recipient) pair — status flips from 'pending' to
// 'accepted' in place once the recipient accepts; there's no second row for
// the reverse direction (see schema.ts's userConnections.status comment).
export interface ConnectionEdge {
  connectionId: string
  status: 'pending' | 'accepted'
  member: MemberSummary
}

interface ReceivedRequest extends MemberSummary {
  connectionId: string // needed by the Accept/Decline buttons
}

export interface ConnectionsState {
  friends: MemberSummary[] // accepted, from either direction
  sentRequests: MemberSummary[] // I requested them, still pending
  receivedRequests: ReceivedRequest[] // they requested me, still pending — mine to accept/decline
}

// Pure derivation of the Friends page's three buckets (feedback #83,
// reworked into a real request/accept model by feedback #127) from the two
// raw edge queries — pulled out so it's unit-testable without a real
// database, same posture as events/comment-permissions.ts and
// camps/grouping.ts elsewhere in this codebase.
export function deriveConnectionsState(outgoing: ConnectionEdge[], incoming: ConnectionEdge[]): ConnectionsState {
  return {
    friends: [
      ...outgoing.filter((e) => e.status === 'accepted').map((e) => e.member),
      ...incoming.filter((e) => e.status === 'accepted').map((e) => e.member),
    ],
    sentRequests: outgoing.filter((e) => e.status === 'pending').map((e) => e.member),
    receivedRequests: incoming
      .filter((e) => e.status === 'pending')
      .map((e) => ({ ...e.member, connectionId: e.connectionId })),
  }
}

// Pure ordering/dedup for the onboarding suggestion list (feedback #83):
// flattens candidate groups in priority order (inviter, then inviter's own
// connections, then grade-level matches), dropping the viewer, anyone
// already connected, and any repeat across groups. The DB queries that
// produce each group live in service.ts; this is the part worth a unit test.
export function buildSuggestionList(
  viewerId: string,
  groups: MemberSummary[][],
  alreadyConnectedIds: Iterable<string>,
): MemberSummary[] {
  const exclude = new Set([viewerId, ...alreadyConnectedIds])
  const seen = new Set<string>()
  const results: MemberSummary[] = []

  for (const group of groups) {
    for (const candidate of group) {
      if (exclude.has(candidate.id) || seen.has(candidate.id)) continue
      seen.add(candidate.id)
      results.push(candidate)
    }
  }

  return results
}
