import { create } from 'zustand'
import type { AxiosError } from 'axios'
import type { SyncOperation, SyncPriority } from '@/types/sync.types'
import { db } from '@/lib/db'
import { apiClient } from '@/lib/api/client'

const priorityRank: Record<SyncPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const MAX_RETRIES = 5
const BASE_RETRY_DELAY_MS = 5000
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000

type SyncErrorKind = 'retry' | 'conflict' | 'permanent'

function getErrorStatus(error: unknown) {
  return (error as AxiosError | undefined)?.response?.status
}

function getErrorPayload(error: unknown) {
  return (error as AxiosError | undefined)?.response?.data
}

function getErrorMessage(error: unknown) {
  const payload = getErrorPayload(error)
  if (payload && typeof payload === 'object') {
    const message = (payload as { error?: string; message?: string }).error ?? (payload as { error?: string; message?: string }).message
    if (message) return message
  }
  return error instanceof Error ? error.message : 'Error de sincronización'
}

function classifySyncError(error: unknown): SyncErrorKind {
  const status = getErrorStatus(error)
  if (!status) return 'retry'
  if (status === 409 || status === 412) return 'conflict'
  if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retry'
  return 'permanent'
}

function getRetryDelayMs(retries: number) {
  const exponentialDelay = Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(retries - 1, 0), MAX_RETRY_DELAY_MS)
  const jitter = Math.floor(Math.random() * 1000)
  return exponentialDelay + jitter
}

function createIdempotencyKey() {
  return `offline-${crypto.randomUUID()}`
}

interface SyncStore {
  isSyncing: boolean
  pendingCount: number
  conflictCount: number
  errorCount: number
  blockedOperations: SyncOperation[]
  lastSyncAt: number | null
  syncError: string | null
  loadPendingCount: () => Promise<void>
  enqueue: (op: Omit<SyncOperation, 'id' | 'status' | 'retries' | 'createdAt' | 'updatedAt' | 'idempotencyKey'> & { idempotencyKey?: string }) => Promise<void>
  flush: () => Promise<void>
  retryOperation: (id: string) => Promise<void>
  discardOperation: (id: string) => Promise<void>
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  errorCount: 0,
  blockedOperations: [],
  lastSyncAt: null,
  syncError: null,

  loadPendingCount: async () => {
    const pending = await db.syncQueue.where('status').equals('pending').count()
    const syncing = await db.syncQueue.where('status').equals('syncing').count()
    const blockedOperations = (await db.syncQueue
      .where('status')
      .anyOf('conflict', 'error')
      .toArray())
      .sort((a, b) => b.createdAt - a.createdAt)
    set({
      pendingCount: pending + syncing,
      conflictCount: blockedOperations.filter((op) => op.status === 'conflict').length,
      errorCount: blockedOperations.filter((op) => op.status === 'error').length,
      blockedOperations,
    })
  },

  enqueue: async (op) => {
    const now = Date.now()
    await db.syncQueue.add({
      ...op,
      id: crypto.randomUUID(),
      idempotencyKey: op.idempotencyKey ?? createIdempotencyKey(),
      status: 'pending',
      retries: 0,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
    })
    await get().loadPendingCount()
  },

  flush: async () => {
    if (get().isSyncing || !navigator.onLine) return

    set({ isSyncing: true, syncError: null })

    try {
      const now = Date.now()
      const staleSyncing = await db.syncQueue.where('status').equals('syncing').toArray()
      await Promise.all(staleSyncing.map((op) => db.syncQueue.update(op.id, { status: 'pending', updatedAt: now })))

      const pending = (await db.syncQueue.where('status').equals('pending').toArray())
        .filter((op) => (op.nextRunAt ?? 0) <= now)
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt - b.createdAt)

      for (const op of pending) {
        try {
          const attemptAt = Date.now()
          const idempotencyKey = op.idempotencyKey ?? createIdempotencyKey()
          await db.syncQueue.update(op.id, {
            status: 'syncing',
            idempotencyKey,
            lastAttemptAt: attemptAt,
            updatedAt: attemptAt,
          })
          await apiClient.request({
            method: op.method,
            url: op.url,
            data: op.body,
            headers: { 'Idempotency-Key': idempotencyKey },
          })
          await db.syncQueue.update(op.id, { status: 'synced', error: undefined, updatedAt: Date.now() })
        } catch (error) {
          const retries = op.retries + 1
          const kind = classifySyncError(error)
          const message = getErrorMessage(error)
          const updatedAt = Date.now()

          if (kind === 'conflict') {
            await db.syncQueue.update(op.id, {
              status: 'conflict',
              retries,
              error: message,
              conflict: getErrorPayload(error),
              updatedAt,
            })
            continue
          }

          if (kind === 'permanent' || retries >= MAX_RETRIES) {
            await db.syncQueue.update(op.id, {
              status: 'error',
              retries,
              error: message,
              updatedAt,
            })
            continue
          }

          await db.syncQueue.update(op.id, {
            status: 'pending',
            retries,
            nextRunAt: updatedAt + getRetryDelayMs(retries),
            error: message,
            updatedAt,
          })
        }
      }

      set({ lastSyncAt: Date.now() })
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error de sincronización' })
    } finally {
      set({ isSyncing: false })
      await get().loadPendingCount()
    }
  },

  retryOperation: async (id) => {
    const now = Date.now()
    await db.syncQueue.update(id, {
      status: 'pending',
      nextRunAt: now,
      error: undefined,
      conflict: undefined,
      updatedAt: now,
    })
    await get().loadPendingCount()
    await get().flush()
  },

  discardOperation: async (id) => {
    await db.syncQueue.delete(id)
    await get().loadPendingCount()
  },
}))
