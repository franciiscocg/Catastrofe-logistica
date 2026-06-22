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

function classifySyncError(error: unknown, operation?: SyncOperation): SyncErrorKind {
  const status = getErrorStatus(error)
  if (!status) return 'retry'
  if (status === 404 && operation?.entity === 'confirmacion-qr') return 'retry'
  if (status === 409 || status === 412) return 'conflict'
  if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retry'
  return 'permanent'
}

async function resolveLocalIds<T>(value: T): Promise<T> {
  if (typeof value === 'string') {
    let resolved: string = value
    const localIds = value.match(/offline-[A-Za-z0-9_-]+/g) ?? []
    for (const localId of localIds) {
      const mapping = await db.idMappings.get(localId)
      if (mapping) resolved = resolved.split(localId).join(mapping.serverId)
    }
    return resolved as unknown as T
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveLocalIds(item))) as Promise<T>
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value as Record<string, unknown>)
      .map(async ([key, item]) => [key, await resolveLocalIds(item)] as const))
    return Object.fromEntries(entries) as T
  }
  return value
}

function responseEntityId(data: unknown, entity?: string) {
  if (!data || typeof data !== 'object') return null
  const payload = data as Record<string, unknown>
  const candidates = [entity, entity?.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), 'donacion', 'incidencia', 'item', 'solicitud', 'asignacion']
  for (const key of candidates) {
    if (!key) continue
    const value = payload[key]
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
      return (value as { id: string }).id
    }
  }
  return typeof payload.id === 'string' ? payload.id : null
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
      const completed = await db.syncQueue.where('status').equals('synced').toArray()
      const completedToDelete = completed.filter((op) => (op.updatedAt ?? op.createdAt) < now - 24 * 60 * 60 * 1000)
      if (completedToDelete.length) await db.syncQueue.bulkDelete(completedToDelete.map((op) => op.id))
      const staleSyncing = await db.syncQueue.where('status').equals('syncing').toArray()
      await Promise.all(staleSyncing.map((op) => db.syncQueue.update(op.id, { status: 'pending', updatedAt: now })))

      const pending = (await db.syncQueue.where('status').equals('pending').toArray())
        .filter((op) => (op.nextRunAt ?? 0) <= now)
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt - b.createdAt)

      for (const op of pending) {
        if (op.dependsOn?.length) {
          const dependencies = await db.syncQueue.bulkGet(op.dependsOn)
          if (dependencies.some((dependency) => dependency?.status !== 'synced')) continue
        }
        try {
          const attemptAt = Date.now()
          const idempotencyKey = op.idempotencyKey ?? createIdempotencyKey()
          await db.syncQueue.update(op.id, {
            status: 'syncing',
            idempotencyKey,
            lastAttemptAt: attemptAt,
            updatedAt: attemptAt,
          })
          const resolvedUrl = await resolveLocalIds(op.url)
          const resolvedBody = await resolveLocalIds(op.body)
          const response = await apiClient.request({
            method: op.method,
            url: resolvedUrl,
            data: resolvedBody,
            headers: { 'Idempotency-Key': idempotencyKey },
          })
          if (op.localEntityId) {
            const serverId = responseEntityId(response.data, op.entity)
            if (serverId) {
              await db.idMappings.put({
                localId: op.localEntityId,
                serverId,
                entity: op.entity ?? 'entity',
                updatedAt: Date.now(),
              })
            }
          }
          await db.syncQueue.update(op.id, { status: 'synced', error: undefined, updatedAt: Date.now() })
        } catch (error) {
          const retries = op.retries + 1
          const kind = classifySyncError(error, op)
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
