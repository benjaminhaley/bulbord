// Mirrors EVENT_SOURCE_TYPES in api/src/events/routes.ts — the server is the
// real source of truth for what's valid, this is just the friendly label for
// the Add/Edit Source forms' picker. 'email' is included so SourceDetailPage's
// edit form has a real option to show/preserve for a source
// findOrCreateEmailSource (email-ingest.ts) already auto-created — not
// expected to be picked when manually adding a new source, but valid either way.
export const EVENT_SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'facebook_group', label: 'Facebook group' },
  { value: 'open_data', label: 'Open data API' },
  { value: 'generic_search', label: 'Generic search' },
  { value: 'email', label: 'Email (inbound)' },
]
