import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock de IndexedDB (Dexie): osmGraphStore persiste/lee el extracto aquí.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    osmGraphs: {
      get: vi.fn(),
      put: vi.fn(),
      toArray: vi.fn(),
    },
  },
}))
vi.mock('@/lib/db', () => ({ db: dbMock }))

const A: [number, number] = [39.41, -0.43]
const B: [number, number] = [39.42, -0.42]

const extracto = {
  id: 'zona-test',
  nombre: 'Zona test',
  bbox: [39.41, -0.43, 39.42, -0.42],
  nodes: [A, B],
  edges: [[0, 1]],
}

beforeEach(() => {
  vi.resetModules() // initLocalRouting está memoizado: módulo fresco por test
  dbMock.osmGraphs.get.mockReset()
  dbMock.osmGraphs.put.mockReset().mockResolvedValue(undefined)
  dbMock.osmGraphs.toArray.mockReset().mockResolvedValue([])
})

describe('osmGraphStore (carga y registro del grafo local)', () => {
  it('online: descarga el extracto del manifiesto, lo cachea y registra el router', async () => {
    dbMock.osmGraphs.get.mockResolvedValue(undefined) // no cacheado aún
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('manifest.json')) return { ok: true, json: async () => ({ extractos: [{ id: 'zona-test' }] }) }
      if (url.includes('zona-test.json')) return { ok: true, json: async () => extracto }
      return { ok: false, json: async () => ({}) }
    }))

    const store = await import('../../../frontend/src/utils/osmGraphStore')
    const routing = await import('../../../frontend/src/utils/routing')

    await store.initLocalRouting()

    expect(store.localRoutingStatus()).toEqual({ disponible: true, zonas: ['zona-test'] })
    expect(dbMock.osmGraphs.put).toHaveBeenCalledWith(expect.objectContaining({ id: 'zona-test' }))
    expect(routing.hasLocalRouter()).toBe(true)

    // Y routing.ts ya enruta localmente dentro de la zona cubierta.
    const res = await routing.fetchRutaMultiParada([A, B], [])
    expect(res.points).toEqual([A, B])
  })

  it('offline: si no hay manifiesto, usa los extractos cacheados en IndexedDB', async () => {
    dbMock.osmGraphs.toArray.mockResolvedValue([{ id: 'zona-test', data: extracto, cachedAt: 1 }])
    dbMock.osmGraphs.get.mockResolvedValue({ id: 'zona-test', data: extracto, cachedAt: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }))) // sin red

    const store = await import('../../../frontend/src/utils/osmGraphStore')
    await store.initLocalRouting()

    expect(store.localRoutingStatus().disponible).toBe(true)
  })

  it('sin manifiesto ni cache: no registra router (la app seguirá con OSRM)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))

    const store = await import('../../../frontend/src/utils/osmGraphStore')
    const routing = await import('../../../frontend/src/utils/routing')
    await store.initLocalRouting()

    expect(store.localRoutingStatus().disponible).toBe(false)
    expect(routing.hasLocalRouter()).toBe(false)
  })
})
