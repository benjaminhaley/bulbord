import { useParams } from 'react-router-dom'

import { EditHistoryVersionPage } from '../edit-history/EditHistoryVersionPage'
import { CampBody, type CampBodyFields } from './CampBody'

export function CampHistoryVersionPage() {
  const { id, editId } = useParams<{ id: string; editId: string }>()
  return (
    <EditHistoryVersionPage
      editId={editId}
      backHref={`/camps/${id}/history`}
      liveHref={`/camps/${id}`}
      renderBody={(entry) => {
        // The snapshot has every editable field but not the couple of
        // display-only ones CampBody also reads (distance_miles,
        // submitted_by) — neither is ever recorded in history (they aren't
        // edit-history/service.ts's EDITABLE_FIELDS.camp), so they're
        // filled in as unknown/absent for a historical view rather than
        // computed fresh.
        const snapshot = { ...entry.after, distance_miles: null, submitted_by: null } as unknown as CampBodyFields
        return <CampBody camp={snapshot} highlightFields={new Set(entry.changed_fields)} />
      }}
    />
  )
}
