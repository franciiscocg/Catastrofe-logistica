import { haversineKm } from './haversine'
import {
  ROUTE_BLOCK_RADIUS_KM,
  countBlockedIncidenciasNearRoute,
  pointToSegmentDistanceKm,
  type IncidenciaRutaInput,
  type ModoTransporte,
} from './geo'
import { calcularBearing } from './navegacion'

// ─────────────────────────────────────────────────────────────────────────────
// Grafo de calles enrutable a partir de un extracto OSM.
//
// Calcula rutas localmente (Dijkstra / A*) sobre el grafo de la zona afectada,
// PENALIZANDO las aristas cortadas en vez de excluirlas: si la unica forma de
// llegar pasa por un corte, devuelve esa ruta en lugar de dejar al usuario sin
// salida ("penalizacion blanda"). Funciona sin red, que es el escenario objetivo
// del proyecto durante una catastrofe.
//
// Es codigo puro (sin IndexedDB ni red): la carga/persistencia del extracto vive
// en osmGraphStore.ts.
// ─────────────────────────────────────────────────────────────────────────────

export type LatLng = [number, number]

// Formato compacto del extracto (lo produce scripts/fetch-osm-graph.mjs).
export interface OsmGraphData {
  id: string
  nombre?: string
  bbox: [number, number, number, number] // [minLat, minLng, maxLat, maxLng]
  nodes: LatLng[]
  edges: Array<[number, number]> // pares de indices de `nodes`
}

export interface GraphRouteOptions {
  mode?: 'dijkstra' | 'astar'
  // Multiplicador de coste para aristas cortadas. Finito = penalizacion blanda
  // (se puede cruzar si no hay alternativa); Infinity = exclusion estricta.
  penaltyFactor?: number
  conPasos?: boolean
}

export interface GraphRouteResult {
  points: LatLng[]
  distanciaKm: number
  duracionMin: number
  incidenciasCercanas: number
  legs?: { steps: unknown[] }[]
}

const SPEED_KMH: Record<ModoTransporte, number> = { driving: 30, foot: 5 }
const BUCKET_DEG = 0.003 // ~330 m: tamano de celda del indice espacial
const DEFAULT_PENALTY = 40 // penalizacion blanda por defecto

interface Edge {
  to: number
  w: number
}

interface OsrmRawStep {
  distance: number
  name: string
  maneuver: { type: string; modifier?: string; location: [number, number] }
}

class MinHeap {
  private h: Array<[number, number]> = []
  get size(): number {
    return this.h.length
  }
  push(item: [number, number]): void {
    const h = this.h
    h.push(item)
    let k = h.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (h[p][0] <= h[k][0]) break
      ;[h[p], h[k]] = [h[k], h[p]]
      k = p
    }
  }
  pop(): [number, number] | undefined {
    const h = this.h
    if (h.length === 0) return undefined
    const top = h[0]
    const last = h.pop() as [number, number]
    if (h.length > 0) {
      h[0] = last
      let k = 0
      const n = h.length
      for (;;) {
        const l = 2 * k + 1
        const r = 2 * k + 2
        let s = k
        if (l < n && h[l][0] < h[s][0]) s = l
        if (r < n && h[r][0] < h[s][0]) s = r
        if (s === k) break
        ;[h[s], h[k]] = [h[k], h[s]]
        k = s
      }
    }
    return top
  }
}

export class RoutableGraph {
  readonly id: string
  private coords: LatLng[]
  private adjacency: Edge[][]
  private bbox: [number, number, number, number]
  private buckets = new Map<string, number[]>()

  constructor(data: OsmGraphData) {
    this.id = data.id
    this.coords = data.nodes
    this.bbox = data.bbox
    this.adjacency = data.nodes.map(() => [])

    for (const [a, b] of data.edges) {
      if (a === b || !this.coords[a] || !this.coords[b]) continue
      const w = haversineKm(this.coords[a][0], this.coords[a][1], this.coords[b][0], this.coords[b][1])
      this.adjacency[a].push({ to: b, w })
      this.adjacency[b].push({ to: a, w })
    }

    this.coords.forEach(([lat, lng], i) => {
      const key = this.bucketKey(lat, lng)
      const arr = this.buckets.get(key)
      if (arr) arr.push(i)
      else this.buckets.set(key, [i])
    })
  }

  get size(): number {
    return this.coords.length
  }

  private bucketKey(lat: number, lng: number): string {
    return `${Math.floor(lat / BUCKET_DEG)},${Math.floor(lng / BUCKET_DEG)}`
  }

  // ¿El punto cae dentro del area cubierta por el extracto? (con pequeno margen)
  contains([lat, lng]: LatLng, marginDeg = 0.002): boolean {
    const [minLat, minLng, maxLat, maxLng] = this.bbox
    return (
      lat >= minLat - marginDeg && lat <= maxLat + marginDeg &&
      lng >= minLng - marginDeg && lng <= maxLng + marginDeg
    )
  }

  // Nodo mas cercano a una coordenada (busqueda por anillos de celdas).
  nearestNode([lat, lng]: LatLng): number {
    const bi = Math.floor(lat / BUCKET_DEG)
    const bj = Math.floor(lng / BUCKET_DEG)
    let best = -1
    let bestD = Infinity
    for (let ring = 0; ring <= 40; ring += 1) {
      for (let di = -ring; di <= ring; di += 1) {
        for (let dj = -ring; dj <= ring; dj += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue // solo el borde
          const arr = this.buckets.get(`${bi + di},${bj + dj}`)
          if (!arr) continue
          for (const id of arr) {
            const d = haversineKm(lat, lng, this.coords[id][0], this.coords[id][1])
            if (d < bestD) {
              bestD = d
              best = id
            }
          }
        }
      }
      // Una vez encontrado algo, un anillo extra basta para garantizar el optimo.
      if (best !== -1 && ring >= 1) break
    }
    return best
  }

  private edgeKey(u: number, v: number): number {
    return u < v ? u * this.coords.length + v : v * this.coords.length + u
  }

  // Aristas bloqueadas por una incidencia CORTADA (mismo criterio que el resto
  // del enrutamiento: tramo dentro del radio de bloqueo).
  private blockedEdges(incidencias: IncidenciaRutaInput[]): Set<number> {
    const cortadas = incidencias.filter((i) => i.estado === 'CORTADA' && !i.pendingSync)
    const blocked = new Set<number>()
    for (const inc of cortadas) {
      const cerca = this.nodesNear([inc.latitud, inc.longitud], ROUTE_BLOCK_RADIUS_KM + 0.05)
      for (const u of cerca) {
        for (const { to: v } of this.adjacency[u]) {
          if (u >= v) continue
          if (pointToSegmentDistanceKm([inc.latitud, inc.longitud], this.coords[u], this.coords[v]) <= ROUTE_BLOCK_RADIUS_KM) {
            blocked.add(this.edgeKey(u, v))
          }
        }
      }
    }
    return blocked
  }

  private nodesNear([lat, lng]: LatLng, radiusKm: number): number[] {
    const rings = Math.max(1, Math.ceil(radiusKm / (BUCKET_DEG * 111)))
    const bi = Math.floor(lat / BUCKET_DEG)
    const bj = Math.floor(lng / BUCKET_DEG)
    const out: number[] = []
    for (let di = -rings; di <= rings; di += 1) {
      for (let dj = -rings; dj <= rings; dj += 1) {
        const arr = this.buckets.get(`${bi + di},${bj + dj}`)
        if (arr) out.push(...arr)
      }
    }
    return out
  }

  // A* (o Dijkstra) entre dos nodos con penalizacion de aristas bloqueadas.
  private shortestPath(
    from: number,
    to: number,
    blocked: Set<number>,
    penaltyFactor: number,
    useAstar: boolean,
  ): number[] | null {
    const n = this.coords.length
    const g = new Array<number>(n).fill(Infinity)
    const prev = new Array<number>(n).fill(-1)
    const done = new Array<boolean>(n).fill(false)
    const [toLat, toLng] = this.coords[to]
    const h = (node: number) =>
      useAstar ? haversineKm(this.coords[node][0], this.coords[node][1], toLat, toLng) : 0

    g[from] = 0
    const pq = new MinHeap()
    pq.push([h(from), from])

    while (pq.size > 0) {
      const [, u] = pq.pop() as [number, number]
      if (done[u]) continue
      done[u] = true
      if (u === to) break
      for (const { to: v, w } of this.adjacency[u]) {
        let peso = w
        if (blocked.has(this.edgeKey(u, v))) {
          if (!Number.isFinite(penaltyFactor)) continue
          peso = w * penaltyFactor
        }
        const nd = g[u] + peso
        if (nd < g[v]) {
          g[v] = nd
          prev[v] = u
          pq.push([nd + h(v), v])
        }
      }
    }

    if (!Number.isFinite(g[to])) return null
    const path: number[] = []
    for (let at = to; at !== -1; at = prev[at]) path.push(at)
    return path.reverse()
  }

  // Calcula una ruta multiparada. Devuelve null si algun waypoint cae fuera del
  // extracto o no hay camino (para que el llamador caiga a OSRM).
  route(
    waypoints: LatLng[],
    incidencias: IncidenciaRutaInput[],
    modo: ModoTransporte = 'driving',
    options: GraphRouteOptions = {},
  ): GraphRouteResult | null {
    if (waypoints.length < 2) return null
    if (this.size === 0) return null
    if (!waypoints.every((wp) => this.contains(wp))) return null

    const penaltyFactor = options.penaltyFactor ?? DEFAULT_PENALTY
    const useAstar = (options.mode ?? 'astar') === 'astar'
    const blocked = this.blockedEdges(incidencias)

    const fullNodes: number[] = []
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const from = this.nearestNode(waypoints[i])
      const to = this.nearestNode(waypoints[i + 1])
      if (from < 0 || to < 0) return null
      const seg = this.shortestPath(from, to, blocked, penaltyFactor, useAstar)
      if (!seg) return null
      fullNodes.push(...(i === 0 ? seg : seg.slice(1)))
    }

    const points: LatLng[] = fullNodes.map((id) => this.coords[id])
    let distanciaKm = 0
    for (let i = 0; i < points.length - 1; i += 1) {
      distanciaKm += haversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
    }
    const speed = SPEED_KMH[modo] ?? SPEED_KMH.driving

    const result: GraphRouteResult = {
      points,
      distanciaKm,
      duracionMin: Math.round((distanciaKm / speed) * 60),
      incidenciasCercanas: countBlockedIncidenciasNearRoute(points, incidencias),
    }
    if (options.conPasos) result.legs = [{ steps: sintetizarPasos(points) }]
    return result
  }
}

// Sintetiza instrucciones giro a giro a partir de la geometria (sin nombres de
// calle: el extracto compacto no los incluye). Detecta maniobras por el cambio
// de rumbo entre tramos consecutivos.
function sintetizarPasos(points: LatLng[]): OsrmRawStep[] {
  if (points.length < 2) return []
  const steps: OsrmRawStep[] = []
  const loc = (p: LatLng): [number, number] => [p[1], p[0]] // OSRM usa [lng, lat]

  let distAcum = haversineKm(points[0][0], points[0][1], points[1][0], points[1][1]) * 1000
  steps.push({ distance: 0, name: '', maneuver: { type: 'depart', location: loc(points[0]) } })

  for (let i = 1; i < points.length - 1; i += 1) {
    const bIn = calcularBearing(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    const bOut = calcularBearing(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
    let delta = ((bOut - bIn + 540) % 360) - 180 // [-180, 180], + = derecha
    const segM = haversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) * 1000

    if (Math.abs(delta) >= 15) {
      // cierra el tramo anterior con su distancia acumulada
      steps[steps.length - 1].distance = Math.round(distAcum)
      steps.push({
        distance: 0,
        name: '',
        maneuver: { type: 'turn', modifier: modifierDeDelta(delta), location: loc(points[i]) },
      })
      distAcum = segM
    } else {
      distAcum += segM
    }
  }

  steps[steps.length - 1].distance = Math.round(distAcum)
  steps.push({ distance: 0, name: '', maneuver: { type: 'arrive', location: loc(points[points.length - 1]) } })
  return steps
}

function modifierDeDelta(delta: number): string {
  const a = Math.abs(delta)
  const lado = delta > 0 ? 'right' : 'left'
  if (a >= 160) return 'uturn'
  if (a >= 115) return `sharp ${lado}`
  if (a >= 45) return lado
  return `slight ${lado}`
}
