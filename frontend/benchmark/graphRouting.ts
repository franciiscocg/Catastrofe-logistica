import { type Grid, type LatLng, MinHeap, snapToNode } from './grid'
import { haversineKm } from '../src/utils/haversine'
import { ROUTE_BLOCK_RADIUS_KM, pointToSegmentDistanceKm } from '../src/utils/routing'
import type { IncidenciaRutaInput } from '../src/utils/routing'

// ─────────────────────────────────────────────────────────────────────────────
// Enrutamiento sobre grafo (propuesta alternativa a la heuristica de desvios)
//
// En lugar de pedir rutas a OSRM y "empujarlas" con waypoints de desvio hasta
// que esquiven los cortes, este enfoque calcula la ruta directamente sobre el
// grafo de calles, marcando como intransitables (o penalizadas) las aristas
// bloqueadas por una incidencia CORTADA. Asi obtiene de una sola pasada la ruta
// OPTIMA consciente de los cortes.
//
// Se implementan Dijkstra y A* (con heuristica haversine, admisible) para poder
// comparar tambien la eficiencia algoritmica entre ambos.
//
// Coste de fidelidad: requiere disponer del grafo de calles en local. En el
// benchmark la rejilla es la "verdad de terreno"; en produccion habria que
// obtenerla (extracto OSM). Esta es la diferencia esencial frente a la
// heuristica, que no necesita grafo pero depende de OSRM.
// ─────────────────────────────────────────────────────────────────────────────

export type GraphMode = 'dijkstra' | 'astar'

export interface GraphRouteOptions {
  mode?: GraphMode
  // Multiplicador de coste para aristas cortadas. Infinity = excluir (evitar a
  // toda costa); un valor finito permite cruzar un corte si no hay alternativa
  // (resiliencia: nunca deja al usuario sin ruta).
  penaltyFactor?: number
  speedKmh?: number
}

export interface GraphRouteResult {
  resolved: boolean
  points: LatLng[]
  distKm: number | null
  duracionMin: number | null
  expansions: number // nodos extraidos de la cola (coste algoritmico)
}

// Clave no dirigida de una arista.
function edgeKey(u: number, v: number, n: number): number {
  return u < v ? u * n + v : v * n + u
}

// Marca como bloqueadas las aristas cuyo tramo cae dentro del radio de una
// incidencia CORTADA. Reutiliza exactamente los mismos primitivos que la
// heuristica (pointToSegmentDistanceKm, ROUTE_BLOCK_RADIUS_KM) para que la
// comparacion sea justa: ambas estrategias "ven" los cortes igual.
function computeBlockedEdges(grid: Grid, incidencias: IncidenciaRutaInput[]): Set<number> {
  const cortadas = incidencias.filter((inc) => inc.estado === 'CORTADA' && !inc.pendingSync)
  const blocked = new Set<number>()
  if (cortadas.length === 0) return blocked
  const n = grid.coords.length

  for (let u = 0; u < grid.adjacency.length; u += 1) {
    for (const { to: v } of grid.adjacency[u]) {
      if (u >= v) continue // cada arista una sola vez
      const a = grid.coords[u]
      const b = grid.coords[v]
      for (const inc of cortadas) {
        if (pointToSegmentDistanceKm([inc.latitud, inc.longitud], a, b) <= ROUTE_BLOCK_RADIUS_KM) {
          blocked.add(edgeKey(u, v, n))
          break
        }
      }
    }
  }
  return blocked
}

export function graphRoute(
  grid: Grid,
  origen: LatLng,
  destino: LatLng,
  incidencias: IncidenciaRutaInput[],
  options: GraphRouteOptions = {},
): GraphRouteResult {
  const mode = options.mode ?? 'dijkstra'
  const penaltyFactor = options.penaltyFactor ?? Infinity
  const speed = options.speedKmh ?? 30

  const n = grid.coords.length
  const from = snapToNode(grid, origen)
  const to = snapToNode(grid, destino)
  const blocked = computeBlockedEdges(grid, incidencias)
  const [toLat, toLng] = grid.coords[to]

  const heuristic = (node: number): number => {
    if (mode === 'dijkstra') return 0
    const [lat, lng] = grid.coords[node]
    return haversineKm(lat, lng, toLat, toLng) // admisible: nunca sobreestima
  }

  const g = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  g[from] = 0
  let expansions = 0

  const pq = new MinHeap()
  pq.push([heuristic(from), from])

  while (pq.size > 0) {
    const [, u] = pq.pop() as [number, number]
    if (done[u]) continue
    done[u] = true
    expansions += 1
    if (u === to) break

    for (const { to: v, w } of grid.adjacency[u]) {
      let peso = w
      if (blocked.has(edgeKey(u, v, n))) {
        if (!Number.isFinite(penaltyFactor)) continue // arista excluida
        peso = w * penaltyFactor
      }
      const nd = g[u] + peso
      if (nd < g[v]) {
        g[v] = nd
        prev[v] = u
        pq.push([nd + heuristic(v), v])
      }
    }
  }

  if (!Number.isFinite(g[to])) {
    return { resolved: false, points: [], distKm: null, duracionMin: null, expansions }
  }

  // Reconstruye el camino y calcula la distancia geografica real (sin penalizar)
  // para poder comparar km contra la heuristica y la ruta directa.
  const nodes: number[] = []
  for (let at = to; at !== -1; at = prev[at]) nodes.push(at)
  nodes.reverse()

  const points: LatLng[] = nodes.map((id) => grid.coords[id])
  let distKm = 0
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const [la, ga] = grid.coords[nodes[i]]
    const [lb, gb] = grid.coords[nodes[i + 1]]
    distKm += haversineKm(la, ga, lb, gb)
  }

  return {
    resolved: true,
    points,
    distKm,
    duracionMin: Math.round((distKm / speed) * 60),
    expansions,
  }
}
