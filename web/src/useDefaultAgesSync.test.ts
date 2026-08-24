import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { Grade } from './auth/api'
import { defaultAgesForKids } from './gradeAges'
import { useDefaultAgesSync } from './useDefaultAgesSync'

// Feedback #122 ("sports and club age filter is blank"): Camps' and Sports
// & Clubs' age filters default from the viewer's kids' grades via a
// useState lazy initializer, computed once at mount. Since Ionic keeps a
// tab page mounted for the whole session once visited (never remounted on
// tab switches), that default never recomputed if kids changed later in
// the same session -- reproduced directly against the real app (SPA nav to
// Sports & Clubs, edit a kid's grade via Edit Profile, tab back with no
// reload: the Age chip kept showing the *old* default). This hook is the
// fix -- these tests exercise the hook in isolation.
function useHarness(kids: { grade: Grade }[] | undefined) {
  // Mirrors CampsPage.tsx/SportsClubsPage.tsx's own real usage: a lazy
  // useState initializer for the first render, kept in sync afterward by
  // the hook under test.
  const [ages, setAges] = useState<number[]>(() => defaultAgesForKids(kids ?? []))
  useDefaultAgesSync(kids, setAges)
  return { ages, setAges }
}

describe('useDefaultAgesSync', () => {
  it('updates ages when kids change from the previous default', () => {
    const { result, rerender } = renderHook(({ kids }) => useHarness(kids), {
      initialProps: { kids: [{ grade: 'pre-k' as Grade }] },
    })
    expect(result.current.ages).toEqual([4, 5])

    rerender({ kids: [{ grade: '5' as Grade }] })
    expect(result.current.ages).toEqual([10, 11])
  })

  it('does not clobber a manually-chosen selection when kids change', () => {
    const { result, rerender } = renderHook(({ kids }) => useHarness(kids), {
      initialProps: { kids: [{ grade: 'pre-k' as Grade }] },
    })

    act(() => {
      result.current.setAges(() => [12])
    })
    expect(result.current.ages).toEqual([12])

    rerender({ kids: [{ grade: '5' as Grade }] })
    // The viewer had already diverged from the default (pre-k's [4, 5]),
    // so a kids change shouldn't silently overwrite their own choice.
    expect(result.current.ages).toEqual([12])
  })

  it('is a no-op when kids are unchanged', () => {
    const { result, rerender } = renderHook(({ kids }) => useHarness(kids), {
      initialProps: { kids: [{ grade: 'pre-k' as Grade }] },
    })
    rerender({ kids: [{ grade: 'pre-k' as Grade }] })
    expect(result.current.ages).toEqual([4, 5])
  })
})
