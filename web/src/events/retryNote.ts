// Feedback #180 (2026-10-04): a retry note on the Add Event review screen goes
// through Pipeline Review's own note interpreter (api/src/events/
// review-note-actions.ts), which can search the web. This applies its decision
// to the events being reviewed, kept as Chicago wall-clock extraction fields.
import type { ExtractedEventFields, NoteDecision } from './api'

// One extraction (a poster's first event plus its additional_events) as one
// flat list, an entry per event, each carrying the shared place/source/topic.
export function toExtractedList(fields: ExtractedEventFields): ExtractedEventFields[] {
  const { additional_events: extras, ...first } = fields
  if (!extras?.length) return [first]
  const { recurrence: _recurrence, ...shared } = first
  // Each event's own fields come only from itself; never the first event's.
  return [
    first,
    ...extras.map((extra) => ({
      ...shared,
      title: extra.title,
      description: extra.description,
      start_date: extra.start_date,
      start_time: extra.start_time,
      end_time: extra.end_time,
      all_day: extra.all_day,
    })),
  ]
}

// Returns the updated list, or null when the decision changes nothing.
// `locked` = events already posted, which are never touched. An edit's place
// fields (venue, address, link) apply to every event still open (one poster,
// one place); its other fields only to the one the member is looking at.
export function applyNoteDecision(
  list: ExtractedEventFields[],
  active: number,
  decision: NoteDecision,
  locked: ReadonlySet<number> = new Set(),
): ExtractedEventFields[] | null {
  if (decision.action === 'edit') {
    const { location_name, address, source_url, start_time, ...own } = decision.fields
    const place = Object.fromEntries(Object.entries({ location_name, address, source_url }).filter(([, v]) => v !== undefined))
    const timing =
      start_time === undefined ? {} : start_time === null ? { start_time: undefined, end_time: undefined, all_day: true } : { start_time, all_day: false }
    const ownChanges = { ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)), ...timing }
    if (Object.keys(place).length === 0 && Object.keys(ownChanges).length === 0) return null
    return list.map((event, i) => (locked.has(i) ? event : { ...event, ...place, ...(i === active ? ownChanges : {}) }))
  }
  if (decision.action === 'split') {
    if (locked.size > 0 || decision.occurrences.length < 2) return null
    const base = list[0]
    return decision.occurrences.map((o) => ({
      ...o,
      location_name: o.location_name ?? base?.location_name,
      address: o.address ?? base?.address,
      source_url: o.source_url ?? base?.source_url,
      topic: base?.topic,
    }))
  }
  return null
}
