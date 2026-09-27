import { describe, expect, it } from 'vitest'

import { groupSourcesByDomain, sourceDomain, type SourceCountRow } from './source-domains.js'

describe('sourceDomain', () => {
  it('strips www and paths', () => {
    expect(sourceDomain('https://www.chipublib.org/locations/51/')).toBe('chipublib.org')
  })

  it('collapses subdomains to the top-level domain', () => {
    expect(sourceDomain('https://chicago.lakevieweast.com/events')).toBe('lakevieweast.com')
    expect(sourceDomain('https://lakevieweast.com/some-post/')).toBe('lakevieweast.com')
  })

  it('uses the sender domain for email sources', () => {
    expect(sourceDomain('mailto:news@Example.org')).toBe('example.org')
  })

  it('falls back to the raw value for something that is not a URL', () => {
    expect(sourceDomain('not a url')).toBe('not a url')
  })
})

describe('groupSourcesByDomain', () => {
  const row = (overrides: Partial<SourceCountRow>): SourceCountRow => ({
    id: 'id',
    name: 'Name',
    url: 'https://example.com/',
    type: 'website',
    isActive: true,
    pastCount: 0,
    futureCount: 0,
    ...overrides,
  })

  it('sums counts across sources that share a domain', () => {
    const groups = groupSourcesByDomain([
      row({ id: 'a', name: 'Lakeview East — calendar', url: 'https://chicago.lakevieweast.com/events', pastCount: 3, futureCount: 1 }),
      row({ id: 'b', name: 'Lakeview East — parade', url: 'https://lakevieweast.com/parade/', pastCount: 1, futureCount: 0 }),
      row({ id: 'c', name: 'Zoo', url: 'https://www.lpzoo.org/', pastCount: 0, futureCount: 5 }),
    ])
    expect(groups.map((g) => [g.domain, g.pastCount, g.futureCount, g.sources.map((s) => s.id)])).toEqual([
      ['lakevieweast.com', 4, 1, ['a', 'b']],
      ['lpzoo.org', 0, 5, ['c']],
    ])
  })

  it('returns nothing for no sources', () => {
    expect(groupSourcesByDomain([])).toEqual([])
  })
})
