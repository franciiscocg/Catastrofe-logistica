import {
  ROUTE_BLOCK_RADIUS_KM,
  blockedIncidenciasNearRoute,
  countBlockedIncidenciasNearRoute,
  pointToSegmentDistanceKm,
  type IncidenciaRutaInput,
  type ModoTransporte,
} from './geo'

// Re-exportamos las primitivas geometricas para no romper a los consumidores
// (y los tests) que las importan desde '@/utils/routing'.
export {
  ROUTE_BLOCK_RADIUS_KM,
  blockedIncidenciasNearRoute,
  countBlockedIncidenciasNearRoute,
  pointToSegmentDistanceKm,
}
export type { IncidenciaRutaInput, ModoTransporte }

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

// ─────────────────────────────────────────────────────────────────────────────
// Enrutador local (grafo OSM) inyectable.
//
// La app puede registrar un enrutador basado en un grafo de calles local (ver
// osmGraphStore.ts). routing.ts NO depende estaticamente de IndexedDB ni del
// grafo: si hay un enrutador local registrado se intenta primero (funciona sin
// red); si no cubre los puntos o no esta disponible, se cae a OSRM. Asi el
// benchmark y los tests, que no registran nada, siguen usando solo OSRM.
// ─────────────────────────────────────────────────────────────────────────────

export interface RutaLocalResult {
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  incidenciasCercanas: number
  legs?: { steps: unknown[] }[]
}

export interface LocalRouter {
  // Devuelve null si el grafo local no cubre los waypoints (→ usar OSRM).
  route(
    waypoints: [number, number][],
    incidencias: IncidenciaRutaInput[],
    modo: ModoTransporte,
    opts?: { conPasos?: boolean },
  ): RutaLocalResult | null
}

let localRouter: LocalRouter | null = null

export function registerLocalRouter(router: LocalRouter | null): void {
  localRouter = router
}

export function hasLocalRouter(): boolean {
  return localRouter !== null
}

function tryLocalRoute(
  waypoints: [number, number][],
  incidencias: IncidenciaRutaInput[],
  modo: ModoTransporte,
  opts?: { conPasos?: boolean },
): RutaLocalResult | null {
  if (!localRouter) return null
  try {
    return localRouter.route(waypoints, incidencias, modo, opts)
  } catch {
    return null // ante cualquier fallo del grafo local, caemos a OSRM
  }
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

  // Primero el grafo local (offline); si no cubre la zona, caemos a OSRM.
  const local = tryLocalRoute(waypoints, incidencias, modo)
  if (local) {
    return {
      points: local.points,
      distanciaKm: local.distanciaKm,
      duracionMin: local.duracionMin,
      incidenciasCercanas: local.incidenciasCercanas,
    }
  }

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

  // Grafo local con pasos sintetizados (offline); fallback a OSRM si no cubre.
  const local = tryLocalRoute(waypoints, incidencias, modo, { conPasos: true })
  if (local && local.legs) {
    return {
      points: local.points,
      distanciaKm: local.distanciaKm,
      duracionMin: local.duracionMin,
      legs: local.legs,
    }
  }

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
): Promise<SafeRouteCandidate> {
  const local = tryLocalRoute([desde, hasta], incidencias, modo)
  if (local) {
    return {
      points: local.points,
      distanciaKm: local.distanciaKm,
      duracionMin: local.duracionMin,
      incidenciasCercanas: local.incidenciasCercanas,
      waypointSet: [desde, hasta],
      incidenciasEvitadas: 0,
    }
  }
  return findSafeRoute(desde, hasta, incidencias, modo, signal)
}
