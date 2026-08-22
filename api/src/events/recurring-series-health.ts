// Root-cause fix for feedback #119: the Nettelhorst French Market went
// silently stale (no new occurrences added past its last seeded date) with
// nothing to notice it — the only thing that could have caught it was a
// human remembering to re-check that specific series. This is the
// mechanical alternative: for any event title with a real, established
// history of recurring (2+ approved occurrences), flag it once its last
// known occurrence is closer than its own typical gap between occurrences
// — i.e. "you're about due for another one of these, and there isn't one."
//
// Grouped by title only (not title+sourceId) deliberately: the original bug
// was several distinct series sharing one bucket source, so grouping by
// source first would have hidden exactly this problem. A title collision
// across two genuinely unrelated real-world series is possible in theory
// but hasn't happened in this data; if it ever does, it'd surface as one
// combined (and probably confusing-looking) row rather than silently
// missing anything, which is the safer failure mode.
//
// A series with only one historical occurrence is never flagged — that's
// indistinguishable from a genuine one-time annual festival (Oktoberfest,
// Northalsted Market Days, etc.), which this codebase deliberately seeds as
// a single row per year. Two or more real dates is what establishes an
// actual cadence to measure against.
export interface RecurringSeriesRow {
  title: string
  sourceId: string | null
  sourceName: string | null
  startDate: string // YYYY-MM-DD
}

export interface LowRecurringSeries {
  title: string
  sourceId: string | null
  sourceName: string | null
  occurrenceCount: number
  lastOccurrenceDate: string
  typicalGapDays: number
  daysUntilLastOccurrence: number // negative once the last known occurrence is already in the past
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / msPerDay)
}

export function findLowRecurringSeries(rows: RecurringSeriesRow[], today: string): LowRecurringSeries[] {
  const byTitle = new Map<string, RecurringSeriesRow[]>()
  for (const row of rows) {
    const group = byTitle.get(row.title)
    if (group) group.push(row)
    else byTitle.set(row.title, [row])
  }

  const results: LowRecurringSeries[] = []

  for (const [title, group] of byTitle) {
    if (group.length < 2) continue

    const sorted = [...group].sort((a, b) => a.startDate.localeCompare(b.startDate))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].startDate, sorted[i].startDate))
    }
    const typicalGapDays = Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length)

    const last = sorted[sorted.length - 1]
    const daysUntilLastOccurrence = daysBetween(today, last.startDate)

    if (daysUntilLastOccurrence < typicalGapDays) {
      results.push({
        title,
        sourceId: last.sourceId,
        sourceName: last.sourceName,
        occurrenceCount: group.length,
        lastOccurrenceDate: last.startDate,
        typicalGapDays,
        daysUntilLastOccurrence,
      })
    }
  }

  return results.sort((a, b) => a.daysUntilLastOccurrence - b.daysUntilLastOccurrence)
}
