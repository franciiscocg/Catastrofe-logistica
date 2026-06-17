import { haversineKm } from './haversine'

// ─────────────────────────────────────────────────────────────────────────────
// Primitivas geometricas compartidas por el enrutamiento (OSRM y grafo local).
//
// Viven aqui (y no en routing.ts) para que tanto el algoritmo heuristico como el
// de grafo las usen sin crear dependencias circulares: ambos "ven" los cortes de
// la misma forma.
// ─────────────────────────────────────────────────────────────────────────────

// Radio (km) alrededor del trazado dentro del cual una incidencia CORTADA se
// considera que bloquea la ruta. ~25 m.
export const ROUTE_BLOCK_RADIUS_KM = 0.025

export interface IncidenciaRutaInput {
  latitud: number
  longitud: number
  estado: 'CORTADA' | 'TRANSITABLE'
  pendingSync?: boolean
}

export type ModoTransporte = 'driving' | 'foot'

// Distancia (km) de un punto al segmento [a, b], proyectando en un plano local
// para que las escalas de latitud/longitud sean correctas a esa latitud.
export function pointToSegmentDistanceKm(
  point: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const latScale = 111
  const lngScale = 111 * Math.cos((point[0] * Math.PI) / 180)
  const px = point[1] * lngScale
  const py = point[0] * latScale
  const ax = a[1] * lngScale
  const ay = a[0] * latScale
  const bx = b[1] * lngScale
  const by = b[0] * latScale
  const dx = bx - ax
  const dy = by - ay

  if (dx === 0 && dy === 0) return haversineKm(point[0], point[1], a[0], a[1])

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function countBlockedIncidenciasNearRoute(
  points: [number, number][],
  incidencias: IncidenciaRutaInput[],
): number {
  const cortadas = incidencias.filter((inc) => inc.estado === 'CORTADA' && !inc.pendingSync)
  return cortadas.filter((inc) => {
    const point: [number, number] = [inc.latitud, inc.longitud]
    for (let i = 0; i < points.length - 1; i += 1) {
      if (pointToSegmentDistanceKm(point, points[i], points[i + 1]) <= ROUTE_BLOCK_RADIUS_KM) return true
    }
    return false
  }).length
}

export function blockedIncidenciasNearRoute<T extends IncidenciaRutaInput>(
  points: [number, number][],
  incidencias: T[],
): T[] {
  const cortadas = incidencias.filter((inc) => inc.estado === 'CORTADA' && !inc.pendingSync)
  return cortadas.filter((inc) => {
    const point: [number, number] = [inc.latitud, inc.longitud]
    for (let i = 0; i < points.length - 1; i += 1) {
      if (pointToSegmentDistanceKm(point, points[i], points[i + 1]) <= ROUTE_BLOCK_RADIUS_KM) return true
    }
    return false
  })
}
