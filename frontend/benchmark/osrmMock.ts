import { type Grid, type LatLng, shortestPath, snapToNode } from './grid'

// ─────────────────────────────────────────────────────────────────────────────
// Mock determinista de OSRM
//
// Sustituye al servidor de rutas real (router.project-osrm.org /
// routing.openstreetmap.de) por un calculo de camino mas corto sobre la rejilla
// sintetica. Es 100% determinista y offline, requisito para que el benchmark
// sea reproducible.
//
// Punto clave de fidelidad: este mock NO conoce las incidencias/cortes. Igual
// que OSRM real, solo enruta entre los waypoints que recibe por la peticion. La
// inteligencia para esquivar cortes vive enteramente en routing.ts (el codigo
// bajo evaluacion), que reacciona insertando waypoints de desvio. Asi medimos
// el algoritmo del proyecto, no el del motor de rutas.
// ─────────────────────────────────────────────────────────────────────────────

const SPEED_KMH: Record<string, number> = { driving: 30, foot: 5 }

// Extrae el perfil (driving/foot) y la lista de coordenadas de una URL de OSRM.
// Formato: .../route/v1/<perfil>/lng,lat;lng,lat;...?params
function parseOsrmUrl(url: string): { profile: string; waypoints: LatLng[] } {
  const match = url.match(/\/route\/v1\/(driving|foot)\/([^?]+)/)
  if (!match) throw new Error(`URL de OSRM no reconocida en el mock: ${url}`)
  const profile = match[1]
  const waypoints: LatLng[] = match[2].split(';').map((pair) => {
    const [lng, lat] = pair.split(',').map(Number)
    return [lat, lng] as LatLng
  })
  return { profile, waypoints }
}

export interface OsrmMock {
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
  callCount: () => number
  reset: () => void
}

export function createOsrmMock(grid: Grid): OsrmMock {
  let calls = 0

  const fetchMock = async (url: string) => {
    calls += 1
    const { profile, waypoints } = parseOsrmUrl(url)
    const speed = SPEED_KMH[profile] ?? SPEED_KMH.driving

    // Encadena el camino mas corto entre waypoints consecutivos, uniendo las
    // piezas y evitando duplicar el nodo de empalme.
    const fullNodes: number[] = []
    const legs: { steps: unknown[] }[] = []
    let totalKm = 0

    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const from = snapToNode(grid, waypoints[i])
      const to = snapToNode(grid, waypoints[i + 1])
      const { distKm, nodes } = shortestPath(grid, from, to)
      totalKm += distKm
      const piece = i === 0 ? nodes : nodes.slice(1)
      fullNodes.push(...piece)
      legs.push({ steps: [] })
    }

    // OSRM devuelve la geometria como [lng, lat]; routing.ts la reconvierte.
    const coordinates: LatLng[] = fullNodes.map((id) => {
      const [lat, lng] = grid.coords[id]
      return [lng, lat]
    })

    const route = {
      distance: totalKm * 1000, // metros
      duration: (totalKm / speed) * 3600, // segundos
      geometry: { coordinates },
      legs,
    }

    return {
      ok: true,
      json: async () => ({ code: 'Ok', routes: [route] }),
    }
  }

  return {
    fetch: fetchMock,
    callCount: () => calls,
    reset: () => {
      calls = 0
    },
  }
}
