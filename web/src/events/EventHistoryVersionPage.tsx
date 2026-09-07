import { useParams } from 'react-router-dom'

import { EditHistoryVersionPage } from '../edit-history/EditHistoryVersionPage'
import { EventBody, type EventBodyFields } from './EventBody'

export function EventHistoryVersionPage() {
  const { id, editId } = useParams<{ id: string; editId: string }>()
  return (
    <EditHistoryVersionPage
      editId={editId}
      backHref={`/events/${id}/history`}
      liveHref={`/events/${id}`}
      renderBody={(entry) => {
        // The snapshot's snake_case keys already match EventBodyFields —
        // both derive from the same api/src/edit-history/service.ts
        // EDITABLE_FIELDS.event allow-list (see events/serialize.ts's
        // snapshotEventForHistory) — so no remapping is needed to render an
        // old version through the exact same component the live page uses.
        const snapshot = entry.after as unknown as EventBodyFields & { title: string }
        return <EventBody event={snapshot} title={snapshot.title} highlightFields={new Set(entry.changed_fields)} />
      }}
    />
  )
}
