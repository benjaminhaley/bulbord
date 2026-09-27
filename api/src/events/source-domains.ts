// Feedback #178: the Sources admin page groups event sources by their
// top-level domain ("chipublib.org"), since one organization can have
// several more specific sources (a branch page, a single announcement
// post). Derived from each source's own URL rather than stored, so there's
// no second column that could drift out of sync with `url`. Pure and
// dependency-free so it's unit-testable without a database.

export interface SourceCountRow {
  id: string
  name: string
  url: string
  type: string
  isActive: boolean
  pastCount: number
  futureCount: number
}

export interface SourceDomainGroup {
  domain: string
  pastCount: number
  futureCount: number
  sources: SourceCountRow[]
}

// "https://www.chipublib.org/locations/51/" -> "chipublib.org",
// "https://chicago.lakevieweast.com/events" -> "lakevieweast.com",
// "mailto:news@example.org" -> "example.org". Keeps the last two host
// labels — right for every .com/.org/.net source this app has; a
// two-part public suffix like .co.uk would need a real suffix list.
export function sourceDomain(url: string): string {
  let host: string
  if (url.startsWith('mailto:')) {
    host = url.slice('mailto:'.length).split('@')[1] ?? ''
  } else {
    try {
      host = new URL(url).hostname
    } catch {
      return url
    }
  }
  const labels = host.toLowerCase().split('.').filter(Boolean)
  return labels.length === 0 ? url : labels.slice(-2).join('.')
}

// Sorted by domain; sources within a domain sorted by name.
export function groupSourcesByDomain(rows: SourceCountRow[]): SourceDomainGroup[] {
  const byDomain = new Map<string, SourceDomainGroup>()
  for (const row of rows) {
    const domain = sourceDomain(row.url)
    const group = byDomain.get(domain) ?? { domain, pastCount: 0, futureCount: 0, sources: [] }
    group.pastCount += row.pastCount
    group.futureCount += row.futureCount
    group.sources.push(row)
    byDomain.set(domain, group)
  }
  const groups = [...byDomain.values()]
  for (const group of groups) group.sources.sort((a, b) => a.name.localeCompare(b.name))
  return groups.sort((a, b) => a.domain.localeCompare(b.domain))
}
