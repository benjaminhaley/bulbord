// Feedback #173: the Add Event form's "Repeats" choices. Mirrors the pattern
// names api/src/events/recurrence.ts expands server-side (the server is the
// authority on which dates get created; this only builds labels and decides
// which patterns make sense for the chosen start date).

export type RepeatPattern = 'weekly' | 'biweekly' | 'monthly_nth' | 'monthly_last'

export const REPEAT_LIMIT_NOTE = 'Repeating events post up to 20 dates, none more than a year out.'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['1st', '2nd', '3rd', '4th']

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export interface RepeatOption {
  value: RepeatPattern
  label: string
}

/** The repeat patterns that fit `startDate` (empty until a date is chosen). */
export function repeatOptionsFor(startDate: string): RepeatOption[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return []
  const date = parse(startDate)
  const weekday = WEEKDAYS[date.getUTCDay()]
  const ordinal = Math.floor((date.getUTCDate() - 1) / 7)
  const isLast = new Date(date.getTime() + 7 * 86_400_000).getUTCMonth() !== date.getUTCMonth()

  const options: RepeatOption[] = [
    { value: 'weekly', label: `Every week on ${weekday}` },
    { value: 'biweekly', label: `Every 2 weeks on ${weekday}` },
  ]
  if (ordinal < 4) options.push({ value: 'monthly_nth', label: `Monthly on the ${ORDINALS[ordinal]} ${weekday}` })
  if (isLast) options.push({ value: 'monthly_last', label: `Monthly on the last ${weekday}` })
  return options
}

/** A pattern (e.g. one the extraction proposed) only survives if it fits the date. */
export function validRepeat(pattern: string | null | undefined, startDate: string): RepeatPattern | '' {
  return repeatOptionsFor(startDate).find((option) => option.value === pattern)?.value ?? ''
}
