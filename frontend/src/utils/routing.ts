import type { IncidenciaMarker } from '@/components/shared/Map'

const ROUTE_BLOCK_RADIUS_KM = 0.025

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371 * c
}

function pointToSegmentDistanceKm(point: [number, number], a: [number, number], b: [number, number]) {
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

function blockedIncidenciasNearRoute(points: [number, number][], incidencias: IncidenciaMarker[]) {
  const cortadas = incidencias.filter((inc) => inc.estado === 'CORTADA' && !inc.pendingSync)
  return cortadas.filter((inc) => {
    const point: [number, number] = [inc.latitud, inc.longitud]
    for (let i = 0; i < points.length - 1; i += 1) {
      if (pointToSegmentDistanceKm(point, points[i], points[i + 1]) <= ROUTE_BLOCK_RADIUS_KM) return true
    }
    return false
  })
}

type RouteCandidate = {
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  incidenciasCercanas: number
}

async function fetchRouteCandidates(
  coordinates: [number, number][],
  incidencias: IncidenciaMarker[],
  signal?: AbortSignal,
): Promise<RouteCandidate[]> {
  const path = coordinates.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url =
    `https://router.project-osrm.org/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&alternatives=true&continue_straight=false`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error('No se encontro ruta disponible')

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

function sortRouteCandidates(candidates: RouteCandidate[]) {
  return candidates.sort((a, b) => (
    a.incidenciasCercanas - b.incidenciasCercanas ||
    a.duracionMin - b.duracionMin ||
    a.distanciaKm - b.distanciaKm
  ))
}

function detourPointsAroundIncidencia(incidencia: IncidenciaMarker): [number, number][] {
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

function buildDetourWaypointSets(desde: [number, number], hasta: [number, number], blocked: IncidenciaMarker[]) {
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

export async function fetchRutaEvitandoIncidencias(
  desde: [number, number],
  hasta: [number, number],
  incidencias: IncidenciaMarker[],
  signal?: AbortSignal,
) {
  const directCandidates = await fetchRouteCandidates([desde, hasta], incidencias, signal)
  const directBest = sortRouteCandidates([...directCandidates])[0]
  if (!directBest) throw new Error('No se encontro ruta disponible')

  const candidates: RouteCandidate[] = [...directCandidates]
  const requestedWaypointSets = new Set<string>()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Busqueda de ruta cancelada', 'AbortError')
    const best = sortRouteCandidates([...candidates])[0]
    if (!best) break
    if (best.incidenciasCercanas === 0) {
      return {
        ...best,
        incidenciasEvitadas: Math.max(0, directBest.incidenciasCercanas - best.incidenciasCercanas),
      }
    }

    const blocked = blockedIncidenciasNearRoute(best.points, incidencias)
    for (const waypointSet of buildDetourWaypointSets(desde, hasta, blocked)) {
      const key = waypointSet.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';')
      if (requestedWaypointSets.has(key)) continue
      requestedWaypointSets.add(key)

      try {
        candidates.push(...await fetchRouteCandidates(waypointSet, incidencias, signal))
      } catch {
        if (signal?.aborted) throw new DOMException('Busqueda de ruta cancelada', 'AbortError')
      }
    }
  }

  throw new Error('No hay una ruta segura que evite todas las incidencias cortadas reportadas.')
}
