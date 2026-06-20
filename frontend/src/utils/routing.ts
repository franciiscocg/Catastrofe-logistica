import { haversineKm } from './haversine'

export const ROUTE_BLOCK_RADIUS_KM = 0.025

export interface IncidenciaRutaInput {
  latitud: number
  longitud: number
  estado: 'CORTADA' | 'TRANSITABLE'
  pendingSync?: boolean
}

export type ModoTransporte = 'driving' | 'foot'

type RouteCandidate = {
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  incidenciasCercanas: number
}

type SafeRouteCandidate = RouteCandidate & {
  waypointSet: [number, number][]
  incidenciasEvitadas: number
}

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

// router.project-osrm.org only has the driving profile. For foot we use
// routing.openstreetmap.de, which exposes an OSRM instance for pedestrian routes.
export function osrmUrl(modo: ModoTransporte, path: string): string {
  if (modo === 'foot') {
    return `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${path}?overview=full&geometries=geojson&alternatives=false`
  }
  return `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=false`
}

async function fetchRouteCandidates(
  coordinates: [number, number][],
  incidencias: IncidenciaRutaInput[],
  modo: ModoTransporte = 'driving',
  signal?: AbortSignal,
): Promise<RouteCandidate[]> {
  const path = coordinates.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const base = osrmUrl(modo, path)
  const url = modo === 'driving'
    ? base.replace('alternatives=false', 'alternatives=true&continue_straight=false')
    : base
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error('No se encontró ruta disponible')

  return data.routes.map((route: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }) => {
    const points: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    )
    return {
      points,
      distanciaKm: route.distance / 1000,
      duracionMin: Math.round(route.duration / 60),
      incidenciasCercanas: blockedIncidenciasNearRoute(points, incidencias).length,
    }
  })
}

function sortRouteCandidates<T extends RouteCandidate>(candidates: T[]): T[] {
  return candidates.sort((a, b) => (
    a.incidenciasCercanas - b.incidenciasCercanas ||
    a.duracionMin - b.duracionMin ||
    a.distanciaKm - b.distanciaKm
  ))
}

function detourPointsAroundIncidencia(incidencia: IncidenciaRutaInput): [number, number][] {
  const mid: [number, number] = [incidencia.latitud, incidencia.longitud]
  const offset = 0.004

  return [
    [mid[0] + offset, mid[1]],
    [mid[0] - offset, mid[1]],
    [mid[0], mid[1] + offset],
    [mid[0], mid[1] - offset],
    [mid[0] + offset, mid[1] + offset],
    [mid[0] + offset, mid[1] - offset],
    [mid[0] - offset, mid[1] + offset],
    [mid[0] - offset, mid[1] - offset],
  ]
}

function buildDetourWaypointSets(
  desde: [number, number],
  hasta: [number, number],
  blocked: IncidenciaRutaInput[],
) {
  const waypointSets: [number, number][][] = []
  const detoursByBlock = blocked.slice(0, 4).map((inc) => detourPointsAroundIncidencia(inc))

  detoursByBlock.forEach((detours) => {
    detours.forEach((detour) => waypointSets.push([desde, detour, hasta]))
  })

  if (detoursByBlock.length > 1) {
    const combinations: [number, number][][] = [[]]
    detoursByBlock.forEach((detours) => {
      const next: [number, number][][] = []
      combinations.forEach((combo) => {
        detours.forEach((detour) => next.push([...combo, detour]))
      })
      combinations.splice(0, combinations.length, ...next)
    })

    combinations.forEach((combo) => waypointSets.push([desde, ...combo, hasta]))
  }

  return waypointSets
}

function waypointSetKey(waypointSet: [number, number][]) {
  return waypointSet.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';')
}

async function findSafeRoute(
  desde: [number, number],
  hasta: [number, number],
  incidencias: IncidenciaRutaInput[],
  modo: ModoTransporte,
  signal?: AbortSignal,
): Promise<SafeRouteCandidate> {
  const directCandidates = await fetchRouteCandidates([desde, hasta], incidencias, modo, signal)
  const directBest = sortRouteCandidates([...directCandidates])[0]
  if (!directBest) throw new Error('No se encontró ruta disponible')

  const candidates: SafeRouteCandidate[] = directCandidates.map((candidate) => ({
    ...candidate,
    waypointSet: [desde, hasta],
    incidenciasEvitadas: Math.max(0, directBest.incidenciasCercanas - candidate.incidenciasCercanas),
  }))
  const requestedWaypointSets = new Set<string>([waypointSetKey([desde, hasta])])

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Búsqueda de ruta cancelada', 'AbortError')
    const best = sortRouteCandidates([...candidates])[0]
    if (!best) break
    if (best.incidenciasCercanas === 0) return best

    const blocked = blockedIncidenciasNearRoute(best.points, incidencias)
    for (const waypointSet of buildDetourWaypointSets(desde, hasta, blocked)) {
      const key = waypointSetKey(waypointSet)
      if (requestedWaypointSets.has(key)) continue
      requestedWaypointSets.add(key)

      try {
        const detourCandidates = await fetchRouteCandidates(waypointSet, incidencias, modo, signal)
        candidates.push(...detourCandidates.map((candidate) => ({
          ...candidate,
          waypointSet,
          incidenciasEvitadas: Math.max(0, directBest.incidenciasCercanas - candidate.incidenciasCercanas),
        })))
      } catch {
        if (signal?.aborted) throw new DOMException('Búsqueda de ruta cancelada', 'AbortError')
      }
    }
  }

  throw new Error('No hay una ruta segura que evite todas las incidencias cortadas reportadas.')
}

async function buildSafeWaypointPath(
  waypoints: [number, number][],
  incidencias: IncidenciaRutaInput[],
  modo: ModoTransporte,
  signal?: AbortSignal,
): Promise<SafeRouteCandidate[]> {
  if (waypoints.length < 2) throw new Error('Se necesitan al menos 2 puntos para calcular la ruta')

  const safeLegs: SafeRouteCandidate[] = []
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    safeLegs.push(await findSafeRoute(waypoints[i], waypoints[i + 1], incidencias, modo, signal))
  }

  return safeLegs
}

export async function fetchRutaMultiParada(
  waypoints: [number, number][],
  incidencias: IncidenciaRutaInput[],
  modo: ModoTransporte = 'driving',
  signal?: AbortSignal,
): Promise<{ points: [number, number][]; distanciaKm: number; duracionMin: number; incidenciasCercanas: number }> {
  if (waypoints.length < 2) throw new Error('Se necesitan al menos 2 puntos para calcular la ruta')

  const safeLegs: SafeRouteCandidate[] = []
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    safeLegs.push(await findSafeRoute(waypoints[i], waypoints[i + 1], incidencias, modo, signal))
  }

  const points = safeLegs.flatMap((leg, idx) => (idx === 0 ? leg.points : leg.points.slice(1)))
  return {
    points,
    distanciaKm: safeLegs.reduce((total, leg) => total + leg.distanciaKm, 0),
    duracionMin: safeLegs.reduce((total, leg) => total + leg.duracionMin, 0),
    incidenciasCercanas: countBlockedIncidenciasNearRoute(points, incidencias),
  }
}

// Fetches a route WITH step-by-step instructions (for turn-by-turn navigation).
// Returns the polyline + the raw OSRM legs array so the caller can parse steps.
export async function fetchRutaConPasos(
  waypoints: [number, number][],
  modo: ModoTransporte = 'driving',
  incidencias: IncidenciaRutaInput[] = [],
  signal?: AbortSignal,
): Promise<{
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  legs: { steps: unknown[] }[]
}> {
  if (waypoints.length < 2) throw new Error('Se necesitan al menos 2 puntos')
  const safeLegs = await buildSafeWaypointPath(waypoints, incidencias, modo, signal)
  const stepLegs: { steps: unknown[] }[] = []

  for (const safeLeg of safeLegs) {
    const path = safeLeg.waypointSet.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const base = osrmUrl(modo, path)
    const url = base.includes('?') ? `${base}&steps=true` : `${base}?steps=true`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
    const data = await res.json()
    if (data.code !== 'Ok') throw new Error('No se encontró ruta disponible')
    stepLegs.push(...(data.routes[0].legs as { steps: unknown[] }[]))
  }

  const points = safeLegs.flatMap((leg, idx) => (idx === 0 ? leg.points : leg.points.slice(1)))
  return {
    points,
    distanciaKm: safeLegs.reduce((total, leg) => total + leg.distanciaKm, 0),
    duracionMin: safeLegs.reduce((total, leg) => total + leg.duracionMin, 0),
    legs: stepLegs,
  }
}

export async function fetchRutaEvitandoIncidencias(
  desde: [number, number],
  hasta: [number, number],
  incidencias: IncidenciaRutaInput[],
  signal?: AbortSignal,
  modo: ModoTransporte = 'driving',
) {
  return findSafeRoute(desde, hasta, incidencias, modo, signal)
}
