import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
vi.mock('@/lib/api/client', () => ({ apiClient: { request } }))

describe('cola offline persistente', () => {
  beforeEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    const { db } = await import('@/lib/db')
    await db.syncQueue.clear()
    await db.idMappings.clear()
    request.mockReset()
    const { useSyncStore } = await import('@/store/sync.store')
    useSyncStore.setState({ isSyncing: false, pendingCount: 0, conflictCount: 0, errorCount: 0, blockedOperations: [] })
  })

  it('reconcilia IDs locales antes de ejecutar operaciones dependientes', async () => {
    request
      .mockResolvedValueOnce({ data: { donacion: { id: 'server-donation-1' } } })
      .mockResolvedValueOnce({ data: { donacion: { id: 'server-donation-1' } } })

    const { useSyncStore } = await import('@/store/sync.store')
    const { db } = await import('@/lib/db')
    await useSyncStore.getState().enqueue({
      entity: 'donacion', method: 'POST', url: '/api/donaciones', body: {}, priority: 'high', localEntityId: 'offline-11111111-1111-1111-1111-111111111111',
    })
    const creation = (await db.syncQueue.toArray())[0]
    await useSyncStore.getState().enqueue({
      entity: 'donacion', method: 'PATCH', url: '/api/donaciones/offline-11111111-1111-1111-1111-111111111111/estado', body: { estado: 'ENTREGADA' }, priority: 'high', dependsOn: [creation.id],
    })

    await useSyncStore.getState().flush()

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1][0].url).toBe('/api/donaciones/server-donation-1/estado')
    expect(await db.syncQueue.where('status').equals('synced').count()).toBe(2)
  })

  it('mantiene las operaciones en IndexedDB mientras no hay conexión', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const { useSyncStore } = await import('@/store/sync.store')
    const { db } = await import('@/lib/db')
    await useSyncStore.getState().enqueue({ entity: 'incidencia', method: 'POST', url: '/api/incidencias', body: { titulo: 'Corte' }, priority: 'high' })

    await useSyncStore.getState().flush()

    expect(request).not.toHaveBeenCalled()
    expect(await db.syncQueue.where('status').equals('pending').count()).toBe(1)
  })
})
