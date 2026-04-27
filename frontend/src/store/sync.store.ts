import { create } from 'zustand'
import { SyncOperation, SyncStatus } from '@/types/sync.types'
import { db } from '@/lib/db'
import { apiClient } from '@/lib/api/client'

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
    const count = await db.syncQueue.where('status').equals('pending').count()
    set({ pendingCount: count })
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
      const pending = await db.syncQueue
        .where('status')
        .equals('pending')
        .sortBy('priority')

      for (const op of pending) {
        try {
          await db.syncQueue.update(op.id, { status: 'syncing' })
          await apiClient.request({ method: op.method, url: op.url, data: op.body })
          await db.syncQueue.update(op.id, { status: 'synced' })
        } catch {
          const retries = op.retries + 1
          await db.syncQueue.update(op.id, {
            status: retries >= 3 ? 'error' : 'pending',
            retries,
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
