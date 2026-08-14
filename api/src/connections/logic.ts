import type { MemberSummary } from './service.js'

export interface ConnectionsState {
  friends: MemberSummary[] // mutual — both sides added each other
  following: MemberSummary[] // I added them, they haven't added me back
  followers: MemberSummary[] // they added me, I haven't added them back ("Added you")
}

// Pure derivation of the Friends page's three buckets (feedback #83) from
// the two raw edge queries — pulled out so the mutual/one-directional split
// is unit-testable without a real database, same posture as
// events/comment-permissions.ts and camps/grouping.ts elsewhere in this
// codebase.
export function deriveConnectionsState(outgoing: MemberSummary[], incoming: MemberSummary[]): ConnectionsState {
  const outgoingIds = new Set(outgoing.map((m) => m.id))
  const incomingIds = new Set(incoming.map((m) => m.id))

  return {
    friends: outgoing.filter((m) => incomingIds.has(m.id)),
    following: outgoing.filter((m) => !incomingIds.has(m.id)),
    followers: incoming.filter((m) => !outgoingIds.has(m.id)),
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
