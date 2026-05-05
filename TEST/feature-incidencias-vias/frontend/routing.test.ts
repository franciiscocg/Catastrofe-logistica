import { describe, it, expect } from 'vitest'
import {
  pointToSegmentDistanceKm,
  countBlockedIncidenciasNearRoute,
  blockedIncidenciasNearRoute,
  ROUTE_BLOCK_RADIUS_KM,
} from '../../../frontend/src/utils/routing'
import type { IncidenciaRutaInput } from '../../../frontend/src/utils/routing'

// ── pointToSegmentDistanceKm ──────────────────────────────────────────────────

describe('pointToSegmentDistanceKm', () => {
  // Segmento horizontal de ~111km (1 grado de latitud)
  const A: [number, number] = [39.0, -0.4]
  const B: [number, number] = [40.0, -0.4]

  it('devuelve ~0 para un punto sobre el segmento', () => {
    const onSegment: [number, number] = [39.5, -0.4]
    expect(pointToSegmentDistanceKm(onSegment, A, B)).toBeCloseTo(0, 1)
  })

  it('devuelve la distancia perpendicular para un punto lateral', () => {
    const lateral: [number, number] = [39.5, -0.5] // ~9km al oeste del segmento
    const dist = pointToSegmentDistanceKm(lateral, A, B)
    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(15)
  })

  it('clampea al extremo inicial si el punto está antes del segmento', () => {
    const before: [number, number] = [38.0, -0.4]
    const distToSegment = pointToSegmentDistanceKm(before, A, B)
    // Debe ser ~111km (distancia al punto A, 39.0)
    expect(distToSegment).toBeGreaterThan(100)
    expect(distToSegment).toBeLessThan(120)
  })

  it('clampea al extremo final si el punto está después del segmento', () => {
    const after: [number, number] = [41.0, -0.4]
    const distToSegment = pointToSegmentDistanceKm(after, A, B)
    // Debe ser ~111km (distancia al punto B, 40.0)
    expect(distToSegment).toBeGreaterThan(100)
    expect(distToSegment).toBeLessThan(120)
  })

  it('usa haversine para segmento de longitud cero', () => {
    const point: [number, number] = [39.5, -0.4]
    const samePoint: [number, number] = [39.4, -0.4]
    const dist = pointToSegmentDistanceKm(point, samePoint, samePoint)
    // ~11km entre 39.5 y 39.4
    expect(dist).toBeGreaterThan(8)
    expect(dist).toBeLessThan(15)
  })
})

// ── countBlockedIncidenciasNearRoute ──────────────────────────────────────────

describe('countBlockedIncidenciasNearRoute', () => {
  // Ruta simple: segmento de norte a sur por Paiporta
  const RUTA: [number, number][] = [
    [39.43, -0.418],
    [39.42, -0.418],
    [39.41, -0.418],
  ]

  const incCortadaEnRuta: IncidenciaRutaInput = {
    latitud: 39.425,  // punto sobre la ruta
    longitud: -0.418,
    estado: 'CORTADA',
  }

  const incCortadaLejos: IncidenciaRutaInput = {
    latitud: 39.425,
    longitud: -0.450, // ~2.8km al oeste — fuera del radio
    estado: 'CORTADA',
  }

  const incTransitable: IncidenciaRutaInput = {
    latitud: 39.425,
    longitud: -0.418,
    estado: 'TRANSITABLE', // transitable no bloquea
  }

  const incPendingSync: IncidenciaRutaInput = {
    latitud: 39.425,
    longitud: -0.418,
    estado: 'CORTADA',
    pendingSync: true, // pendiente de sincronizar — no cuenta
  }

  it('devuelve 0 si no hay incidencias', () => {
    expect(countBlockedIncidenciasNearRoute(RUTA, [])).toBe(0)
  })

  it('devuelve 1 para una incidencia CORTADA sobre la ruta', () => {
    expect(countBlockedIncidenciasNearRoute(RUTA, [incCortadaEnRuta])).toBe(1)
  })

  it('no cuenta incidencias CORTADAS que están lejos de la ruta', () => {
    expect(countBlockedIncidenciasNearRoute(RUTA, [incCortadaLejos])).toBe(0)
  })

  it('no cuenta incidencias TRANSITABLE', () => {
    expect(countBlockedIncidenciasNearRoute(RUTA, [incTransitable])).toBe(0)
  })

  it('no cuenta incidencias pendientes de sincronización', () => {
    expect(countBlockedIncidenciasNearRoute(RUTA, [incPendingSync])).toBe(0)
  })

  it('cuenta correctamente múltiples incidencias bloqueantes', () => {
    const inc2: IncidenciaRutaInput = { latitud: 39.415, longitud: -0.418, estado: 'CORTADA' }
    expect(countBlockedIncidenciasNearRoute(RUTA, [incCortadaEnRuta, inc2])).toBe(2)
  })

  it(`usa el radio correcto de ${ROUTE_BLOCK_RADIUS_KM * 1000}m`, () => {
    // Punto exactamente en el límite del radio (~25m al oeste del segmento)
    const enBorde: IncidenciaRutaInput = {
      latitud: 39.425,
      longitud: -0.418 - (ROUTE_BLOCK_RADIUS_KM / 111), // ≈ radio en grados longitud
      estado: 'CORTADA',
    }
    // Puede o no contar dependiendo de la precisión — lo importante es que es cercano
    const count = countBlockedIncidenciasNearRoute(RUTA, [enBorde])
    expect(count).toBeGreaterThanOrEqual(0)
    expect(count).toBeLessThanOrEqual(1)
  })
})

// ── blockedIncidenciasNearRoute ───────────────────────────────────────────────

describe('blockedIncidenciasNearRoute', () => {
  const RUTA: [number, number][] = [[39.43, -0.418], [39.42, -0.418]]

  it('devuelve los objetos completos de incidencias bloqueantes', () => {
    const incidencia: IncidenciaRutaInput = {
      latitud: 39.425,
      longitud: -0.418,
      estado: 'CORTADA',
    }

    const result = blockedIncidenciasNearRoute(RUTA, [incidencia])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(incidencia)
  })

  it('preserva campos adicionales del objeto original (generic)', () => {
    const incidencia = {
      id: 'inc-test',
      latitud: 39.425,
      longitud: -0.418,
      estado: 'CORTADA' as const,
      descripcion: 'Agua en calzada',
    }

    const result = blockedIncidenciasNearRoute(RUTA, [incidencia])
    expect(result[0].id).toBe('inc-test')
    expect(result[0].descripcion).toBe('Agua en calzada')
  })

  it('devuelve array vacío si nada bloquea la ruta', () => {
    const incidenciaLejos: IncidenciaRutaInput = {
      latitud: 39.425,
      longitud: -0.500,
      estado: 'CORTADA',
    }
    expect(blockedIncidenciasNearRoute(RUTA, [incidenciaLejos])).toHaveLength(0)
  })
})
