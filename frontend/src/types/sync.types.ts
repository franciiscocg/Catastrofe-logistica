export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'conflict'
export type SyncPriority = 'critical' | 'high' | 'normal' | 'low'

export interface SyncOperation {
  id: string
  entity?: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  idempotencyKey: string
  priority: SyncPriority
  status: SyncStatus
  retries: number
  createdAt: number
  updatedAt?: number
  lastAttemptAt?: number
  nextRunAt?: number
  error?: string
  conflict?: unknown
  localEntityId?: string
  dependsOn?: string[]
}
