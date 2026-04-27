export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'
export type SyncPriority = 'critical' | 'high' | 'normal' | 'low'

export interface SyncOperation {
  id: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  priority: SyncPriority
  status: SyncStatus
  retries: number
  createdAt: number
  error?: string
}
