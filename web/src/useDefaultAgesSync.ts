import { useEffect, useRef } from 'react'

import type { Grade } from './auth/api'
import { defaultAgesForKids } from './gradeAges'

function sameAges(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

// Camps' and Sports & Clubs' age filters both default on to the viewer's
// kids' permissive ages (see gradeAges.ts), computed once via a lazy
// `useState` initializer at first mount. That's fine at app boot (JoinGate
// blocks every tab from mounting at all until `user`, kids included, is
// fully loaded — see JoinGate.tsx), but Ionic keeps a tab's page mounted
// for the rest of the session once first visited (`.ion-page-hidden`, not
// unmounted — see CLAUDE.md's Events/Camps "IonRouterOutlet keeps a popped
// page alive" notes). If a member visits Camps or Sports & Clubs, then
// later edits their kids via Edit Profile in the same session, the
// already-mounted page's age filter never recomputes — feedback #122's
// "sports and club age filter is blank" (reproduced directly: SPA nav to
// Sports & Clubs, edit a kid's grade via /account/edit, tab back without a
// reload -- the Age chip keeps showing the *old* default, only correcting
// itself on a full page reload).
//
// This re-syncs `ages` to the new default whenever the viewer's kids'
// grades actually change, but only when the current value still equals the
// *previous* computed default -- so a member who has manually adjusted the
// filter away from the default doesn't have that choice silently
// overwritten by an unrelated kids change.
export function useDefaultAgesSync(kids: { grade: Grade }[] | undefined, setAges: (updater: (prev: number[]) => number[]) => void) {
  const lastDefaultRef = useRef<number[]>(defaultAgesForKids(kids ?? []))
  const kidsKey = (kids ?? []).map((kid) => kid.grade).join(',')

  useEffect(() => {
    const nextDefault = defaultAgesForKids(kids ?? [])
    if (!sameAges(nextDefault, lastDefaultRef.current)) {
      setAges((prevAges) => (sameAges(prevAges, lastDefaultRef.current) ? nextDefault : prevAges))
      lastDefaultRef.current = nextDefault
    }
    // Only kidsKey actually needs to retrigger this -- `kids`/`setAges` are
    // both read fresh via closure when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsKey])
}
