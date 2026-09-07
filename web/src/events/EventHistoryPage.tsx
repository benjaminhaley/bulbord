import { useParams } from 'react-router-dom'

import { EditHistoryListPage } from '../edit-history/EditHistoryListPage'

export function EventHistoryPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <EditHistoryListPage
      entityType="event"
      entityId={id}
      title="Event"
      backHref={`/events/${id}`}
      detailPathPrefix={`/events/${id}/history`}
    />
  )
}
