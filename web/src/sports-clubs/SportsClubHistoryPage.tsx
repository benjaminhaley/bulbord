import { useParams } from 'react-router-dom'

import { EditHistoryListPage } from '../edit-history/EditHistoryListPage'

export function SportsClubHistoryPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <EditHistoryListPage
      entityType="sports_club"
      entityId={id}
      title="Listing"
      backHref={`/sports-clubs/${id}`}
      detailPathPrefix={`/sports-clubs/${id}/history`}
    />
  )
}
