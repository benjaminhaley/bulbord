import { useParams } from 'react-router-dom'

import { EditHistoryVersionPage } from '../edit-history/EditHistoryVersionPage'
import { SportsClubBody, type SportsClubBodyFields } from './SportsClubBody'

export function SportsClubHistoryVersionPage() {
  const { id, editId } = useParams<{ id: string; editId: string }>()
  return (
    <EditHistoryVersionPage
      editId={editId}
      backHref={`/sports-clubs/${id}/history`}
      liveHref={`/sports-clubs/${id}`}
      renderBody={(entry) => {
        // distance_miles/submitted_by/occurrences aren't part of
        // edit-history/service.ts's EDITABLE_FIELDS.sports_club (never
        // recorded), so a historical view shows them as unknown/absent
        // rather than computed fresh — same posture as Camp's own version
        // page.
        const snapshot = { ...entry.after, distance_miles: null, submitted_by: null, occurrences: [] } as unknown as SportsClubBodyFields
        return <SportsClubBody club={snapshot} highlightFields={new Set(entry.changed_fields)} />
      }}
    />
  )
}
