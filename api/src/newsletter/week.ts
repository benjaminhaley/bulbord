import { todayInChicago } from '../dates.js'

// Parsed/formatted entirely via Date.UTC and toISOString — deliberately
// never touches the running process's own local timezone (unlike
// `new Date('YYYY-MM-DDT00:00:00')`, which parses as local time and would
// shift the date by a day when run from a positive-UTC-offset machine).
function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// The newsletter is sent Sunday night covering the upcoming Monday–Sunday.
// Run on any other day (e.g. a manual test send), this still resolves to
// "the next Monday through the Sunday after it" — running it ON a Monday
// treats that Monday as the start of the range, rather than skipping ahead
// a full week.
export function getUpcomingWeekRange(now = new Date()): { monday: string; sunday: string } {
  const today = parseISODate(todayInChicago(now))
  const dayOfWeek = today.getUTCDay() // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7
  const monday = addDays(today, daysUntilMonday)
  const sunday = addDays(monday, 6)
  return { monday: toISODate(monday), sunday: toISODate(sunday) }
}
