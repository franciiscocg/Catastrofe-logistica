// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  pointToSegmentDistanceKm,
  blockedIncidenciasNearRoute,
  ROUTE_BLOCK_RADIUS_KM,
} from '../../../frontend/src/utils/routing'
import type { IncidenciaMarker } from '../../../frontend/src/components/shared/Map'

// ── pointToSegmentDistanceKm ──────────────────────────────────────────────────

describe('pointToSegmentDistanceKm', () => {
  const A: [number, number] = [39.0, -0.4]
  const B: [number, number] = [40.0, -0.4]

  it('devuelve ~0 para un punto sobre el segmento', () => {
    const sobre: [number, number] = [39.5, -0.4]
    expect(pointToSegmentDistanceKm(sobre, A, B)).toBeCloseTo(0, 1)
  })

  it('devuelve la distancia perpendicular para un punto lateral', () => {
    const lateral: [number, number] = [39.5, -0.5]
    const dist = pointToSegmentDistanceKm(lateral, A, B)
    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(15)
  })

  it('clampea al extremo inicial si el punto está antes del segmento', () => {
    const before: [number, number] = [38.0, -0.4]
    const dist = pointToSegmentDistanceKm(before, A, B)
    expect(dist).toBeGreaterThan(100)
    expect(dist).toBeLessThan(120)
  })

  it('clampea al extremo final si el punto está despues del segmento', () => {
    const after: [number, number] = [41.0, -0.4]
    const dist = pointToSegmentDistanceKm(after, A, B)
    expect(dist).toBeGreaterThan(100)
    expect(dist).toBeLessThan(120)
  })

  it('usa haversine para segmento de longitud cero (punto degenerado)', () => {
    const point: [number, number] = [39.5, -0.4]
    const samePoint: [number, number] = [39.4, -0.4]
    const dist = pointToSegmentDistanceKm(point, samePoint, samePoint)
    expect(dist).toBeGreaterThan(8)
    expect(dist).toBeLessThan(15)
  })
})

// ── blockedIncidenciasNearRoute ───────────────────────────────────────────────
// Detecta incidencias CORTADAS que bloquean la ruta del voluntario hacia el puesto

describe('blockedIncidenciasNearRoute', () => {
  // Ruta simple de Norte a Sur por Paiporta
  const RUTA: [number, number][] = [
    [39.43, -0.418],
    [39.42, -0.418],
    [39.41, -0.418],
  ]

  const incCortadaEnRuta: IncidenciaMarker = {
    id: 'inc-1', latitud: 39.425, longitud: -0.418, estado: 'CORTADA',
  }

  const incCortadaLejos: IncidenciaMarker = {
    id: 'inc-2', latitud: 39.425, longitud: -0.450, estado: 'CORTADA',
  }

  const incTransitable: IncidenciaMarker = {
    id: 'inc-3', latitud: 39.425, longitud: -0.418, estado: 'TRANSITABLE',
  }

  const incPendingSync: IncidenciaMarker = {
    id: 'inc-4', latitud: 39.425, longitud: -0.418, estado: 'CORTADA', pendingSync: true,
  }

  it('devuelve array vacio si no hay incidencias', () => {
    expect(blockedIncidenciasNearRoute(RUTA, [])).toHaveLength(0)
  })

  it('detecta una incidencia CORTADA que está sobre la ruta del voluntario', () => {
    const blocked = blockedIncidenciasNearRoute(RUTA, [incCortadaEnRuta])
    expect(blocked).toHaveLength(1)
    expect(blocked[0].id).toBe('inc-1')
  })

  it('no bloquea si la incidencia CORTADA está lejos de la ruta', () => {
    expect(blockedIncidenciasNearRoute(RUTA, [incCortadaLejos])).toHaveLength(0)
  })

  it('no cuenta incidencias en estado TRANSITABLE — la calle ya es segura', () => {
    expect(blockedIncidenciasNearRoute(RUTA, [incTransitable])).toHaveLength(0)
  })

  it('no cuenta incidencias pendientes de sincronizacion (modo offline)', () => {
    expect(blockedIncidenciasNearRoute(RUTA, [incPendingSync])).toHaveLength(0)
  })

  it('detecta multiples incidencias bloqueantes en la misma ruta', () => {
    const inc2: IncidenciaMarker = { id: 'inc-5', latitud: 39.415, longitud: -0.418, estado: 'CORTADA' }
    expect(blockedIncidenciasNearRoute(RUTA, [incCortadaEnRuta, inc2])).toHaveLength(2)
  })

  it('devuelve el objeto completo de la incidencia bloqueante', () => {
    const result = blockedIncidenciasNearRoute(RUTA, [incCortadaEnRuta])
    expect(result[0]).toMatchObject({ id: 'inc-1', estado: 'CORTADA', latitud: 39.425 })
  })

  it(`usa el radio correcto de ${ROUTE_BLOCK_RADIUS_KM * 1000}m para considerar bloqueo`, () => {
    const enBorde: IncidenciaMarker = {
      id: 'inc-borde',
      latitud: 39.425,
      longitud: -0.418 - (ROUTE_BLOCK_RADIUS_KM / 111),
      estado: 'CORTADA',
    }
    const count = blockedIncidenciasNearRoute(RUTA, [enBorde]).length
    expect(count).toBeGreaterThanOrEqual(0)
    expect(count).toBeLessThanOrEqual(1)
  })
})
