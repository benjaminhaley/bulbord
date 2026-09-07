import { useParams } from 'react-router-dom'

import { EditHistoryListPage } from '../edit-history/EditHistoryListPage'

export function CampHistoryPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <EditHistoryListPage entityType="camp" entityId={id} title="Camp" backHref={`/camps/${id}`} detailPathPrefix={`/camps/${id}/history`} />
  )
}
