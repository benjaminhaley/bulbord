// Mirrors EVENT_SOURCE_TYPES in api/src/events/routes.ts — the server is the
// real source of truth for what's valid, this is just the friendly label for
// the Add Source form's picker.
export const EVENT_SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'facebook_group', label: 'Facebook group' },
  { value: 'open_data', label: 'Open data API' },
  { value: 'generic_search', label: 'Generic search' },
]
