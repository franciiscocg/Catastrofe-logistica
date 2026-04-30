import { create } from 'zustand'
import type { SyncOperation, SyncPriority } from '@/types/sync.types'
import { db } from '@/lib/db'
import { apiClient } from '@/lib/api/client'

const priorityRank: Record<SyncPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

interface SyncStore {
  isSyncing: boolean
  pendingCount: number
  lastSyncAt: number | null
  syncError: string | null
  loadPendingCount: () => Promise<void>
  enqueue: (op: Omit<SyncOperation, 'id' | 'status' | 'retries' | 'createdAt'>) => Promise<void>
  flush: () => Promise<void>
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  syncError: null,

  loadPendingCount: async () => {
    const pending = await db.syncQueue.where('status').equals('pending').count()
    const syncing = await db.syncQueue.where('status').equals('syncing').count()
    set({ pendingCount: pending + syncing })
  },

  enqueue: async (op) => {
    await db.syncQueue.add({
      ...op,
      id: crypto.randomUUID(),
      status: 'pending',
      retries: 0,
      createdAt: Date.now(),
    })
    await get().loadPendingCount()
  },

  flush: async () => {
    if (get().isSyncing || !navigator.onLine) return

    set({ isSyncing: true, syncError: null })

    try {
      const staleSyncing = await db.syncQueue.where('status').equals('syncing').toArray()
      await Promise.all(staleSyncing.map((op) => db.syncQueue.update(op.id, { status: 'pending' })))

      const pending = (await db.syncQueue.where('status').equals('pending').toArray())
        .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.createdAt - b.createdAt)

      for (const op of pending) {
        try {
          await db.syncQueue.update(op.id, { status: 'syncing' })
          await apiClient.request({ method: op.method, url: op.url, data: op.body })
          await db.syncQueue.update(op.id, { status: 'synced' })
        } catch (error) {
          const retries = op.retries + 1
          await db.syncQueue.update(op.id, {
            status: retries >= 3 ? 'error' : 'pending',
            retries,
            error: error instanceof Error ? error.message : 'Error de sincronizacion',
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
}))
