import { timesFromChicagoWallClock } from '../timezone.js'

// Sports-club occurrences are stored as real instants (starts_at/ends_at).
// The generators and seed data that produce them speak Chicago wall-clock
// (`date` + `startTime`/`endTime`); this converts one such row into the
// stored shape, passing every other field (sportsClubId, note, ...) through.
export function withOccurrenceTimes<T extends { date: string; startTime?: string | null; endTime?: string | null }>(
  o: T,
): Omit<T, 'date' | 'startTime' | 'endTime'> & ReturnType<typeof timesFromChicagoWallClock> {
  const { date, startTime, endTime, ...rest } = o
  return { ...rest, ...timesFromChicagoWallClock({ date, startTime, endTime }) }
}
