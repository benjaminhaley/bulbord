import { API_URL } from '../config'
import { authHeaders } from '../auth/token'
import type { EntityType } from './types'

interface EditHistoryActor {
  type: 'member' | 'system'
  name: string
  avatar_url: string | null
  description: string | null
}

export interface EditHistoryListItem {
  id: string
  actor: EditHistoryActor
  created_at: string
  changed_fields: string[]
}

export interface EditHistoryDetail extends EditHistoryListItem {
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export async function fetchEditHistory(entityType: EntityType, entityId: string): Promise<EditHistoryListItem[]> {
  const res = await fetch(`${API_URL}/edit-history?entity_type=${entityType}&entity_id=${entityId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load edit history')
  const { data } = await res.json()
  return data
}

export async function fetchEditHistoryEntry(id: string): Promise<EditHistoryDetail> {
  const res = await fetch(`${API_URL}/edit-history/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load history entry')
  const { data } = await res.json()
  return data
}

export async function restoreEditHistoryEntry(id: string): Promise<{ restored: boolean; entity_type: EntityType; entity_id: string }> {
  const res = await fetch(`${API_URL}/edit-history/${id}/restore`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to restore this version')
  const { data } = await res.json()
  return data
}
