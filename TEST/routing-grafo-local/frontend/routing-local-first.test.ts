import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRutaConPasos,
  fetchRutaEvitandoIncidencias,
  fetchRutaMultiParada,
  registerLocalRouter,
  type LocalRouter,
} from '../../../frontend/src/utils/routing'

// Verifica la estrategia "local-first con fallback a OSRM" de routing.ts:
// si hay un enrutador local registrado se usa primero (sin tocar la red); si
// devuelve null (zona no cubierta) se cae a OSRM (fetch).

const osrmResponse = (coordinates: [number, number][], distance = 2000, duration = 1200) => ({
  ok: true,
  json: async () => ({
    code: 'Ok',
    routes: [{ distance, duration, geometry: { coordinates }, legs: [{ steps: [{ maneuver: { type: 'depart' } }] }] }],
  }),
})

const A: [number, number] = [39.41, -0.43]
const B: [number, number] = [39.42, -0.42]

afterEach(() => {
  registerLocalRouter(null)
  vi.unstubAllGlobals()
})

describe('routing local-first (grafo local + fallback OSRM)', () => {
  it('usa el enrutador local cuando está disponible, sin llamar a OSRM', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('No debería llamarse a la red cuando hay grafo local')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const local: LocalRouter = {
      route: () => ({
        points: [A, B],
        distanciaKm: 1.5,
        duracionMin: 3,
        incidenciasCercanas: 0,
      }),
    }
    registerLocalRouter(local)

    const res = await fetchRutaMultiParada([A, B], [])
    expect(res.distanciaKm).toBe(1.5)
    expect(res.points).toEqual([A, B])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cae a OSRM cuando el enrutador local devuelve null (zona no cubierta)', async () => {
    const fetchSpy = vi.fn(async () => osrmResponse([[-0.43, 39.41], [-0.42, 39.42]]))
    vi.stubGlobal('fetch', fetchSpy)

    registerLocalRouter({ route: () => null })

    const res = await fetchRutaMultiParada([A, B], [])
    expect(fetchSpy).toHaveBeenCalled()
    expect(res.points).toEqual([[39.41, -0.43], [39.42, -0.42]])
  })

  it('usa OSRM cuando no hay ningún enrutador local registrado', async () => {
    const fetchSpy = vi.fn(async () => osrmResponse([[-0.43, 39.41], [-0.42, 39.42]]))
    vi.stubGlobal('fetch', fetchSpy)

    const res = await fetchRutaMultiParada([A, B], [])
    expect(fetchSpy).toHaveBeenCalled()
    expect(res.distanciaKm).toBeCloseTo(2, 5)
  })

  it('fetchRutaConPasos usa los pasos del grafo local si los aporta', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('no red')
    })
    vi.stubGlobal('fetch', fetchSpy)

    registerLocalRouter({
      route: () => ({
        points: [A, B],
        distanciaKm: 1,
        duracionMin: 2,
        incidenciasCercanas: 0,
        legs: [{ steps: [{ maneuver: { type: 'depart' } }, { maneuver: { type: 'arrive' } }] }],
      }),
    })

    const res = await fetchRutaConPasos([A, B], 'driving', [])
    expect(res.legs[0].steps).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetchRutaEvitandoIncidencias devuelve la forma SafeRoute con el grafo local', async () => {
    registerLocalRouter({
      route: () => ({ points: [A, B], distanciaKm: 1, duracionMin: 2, incidenciasCercanas: 0 }),
    })

    const res = await fetchRutaEvitandoIncidencias(A, B, [])
    expect(res.waypointSet).toEqual([A, B])
    expect(res.incidenciasEvitadas).toBe(0)
    expect(res.incidenciasCercanas).toBe(0)
  })
})
