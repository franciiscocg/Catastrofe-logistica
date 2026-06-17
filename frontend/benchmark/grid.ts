import { haversineKm } from '../src/utils/haversine'

// ─────────────────────────────────────────────────────────────────────────────
// Red de calles sintetica
//
// Modelamos la ciudad como una rejilla regular de calles (grafo de manzanas).
// Cada nodo es un cruce; cada arista, un tramo de calle entre cruces adyacentes
// (conectividad N/S/E/O). El peso de la arista es la distancia haversine real
// entre los dos cruces, de modo que las distancias del benchmark estan en km
// reales.
//
// Esta rejilla actua como "verdad de terreno": el mock de OSRM calcula sobre
// ella el camino mas corto (Dijkstra), igual que haria un motor de rutas real
// sobre la red de calles. El algoritmo bajo evaluacion (routing.ts) NO conoce
// la rejilla: solo ve respuestas de OSRM, exactamente como en produccion.
//
// Centro de la rejilla: Paiporta (Valencia), zona afectada por la DANA de 2024,
// coherente con el dominio de catastrofes del proyecto.
// ─────────────────────────────────────────────────────────────────────────────

export const LAT0 = 39.41
export const LNG0 = -0.43
export const STEP = 0.001 // ~111 m N/S, ~86 m E/O a esta latitud
export const ROWS = 25
export const COLS = 25

export type LatLng = [number, number]

interface Edge {
  to: number
  w: number
}

export interface Grid {
  rows: number
  cols: number
  coords: LatLng[]
  adjacency: Edge[][]
}

export function nodeId(i: number, j: number): number {
  return i * COLS + j
}

export function nodeCoord(grid: Grid, id: number): LatLng {
  return grid.coords[id]
}

// Construye la rejilla una sola vez. Conectividad de 4 vecinos.
export function buildGrid(): Grid {
  const coords: LatLng[] = []
  for (let i = 0; i < ROWS; i += 1) {
    for (let j = 0; j < COLS; j += 1) {
      coords.push([LAT0 + i * STEP, LNG0 + j * STEP])
    }
  }

  const adjacency: Edge[][] = coords.map(() => [])
  const link = (a: number, b: number) => {
    const [la, ga] = coords[a]
    const [lb, gb] = coords[b]
    const w = haversineKm(la, ga, lb, gb)
    adjacency[a].push({ to: b, w })
    adjacency[b].push({ to: a, w })
  }

  for (let i = 0; i < ROWS; i += 1) {
    for (let j = 0; j < COLS; j += 1) {
      const id = nodeId(i, j)
      if (j + 1 < COLS) link(id, nodeId(i, j + 1)) // este
      if (i + 1 < ROWS) link(id, nodeId(i + 1, j)) // sur
    }
  }

  return { rows: ROWS, cols: COLS, coords, adjacency }
}

// Ajusta una coordenada arbitraria al cruce mas cercano de la rejilla.
// Replica el "snapping" que hace un motor de rutas real al recibir un waypoint
// que no cae exactamente sobre una calle.
export function snapToNode(grid: Grid, [lat, lng]: LatLng): number {
  const i = Math.max(0, Math.min(ROWS - 1, Math.round((lat - LAT0) / STEP)))
  const j = Math.max(0, Math.min(COLS - 1, Math.round((lng - LNG0) / STEP)))
  return nodeId(i, j)
}

// Min-heap binario para Dijkstra (la rejilla tiene cientos de nodos y el
// benchmark ejecuta decenas de miles de busquedas: conviene que sea eficiente).
export class MinHeap {
  private heap: Array<[number, number]> = [] // [dist, node]

  get size(): number {
    return this.heap.length
  }

  push(item: [number, number]): void {
    const h = this.heap
    h.push(item)
    let k = h.length - 1
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (h[parent][0] <= h[k][0]) break
      ;[h[parent], h[k]] = [h[k], h[parent]]
      k = parent
    }
  }

  pop(): [number, number] | undefined {
    const h = this.heap
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
        let smallest = k
        if (l < n && h[l][0] < h[smallest][0]) smallest = l
        if (r < n && h[r][0] < h[smallest][0]) smallest = r
        if (smallest === k) break
        ;[h[smallest], h[k]] = [h[k], h[smallest]]
        k = smallest
      }
    }
    return top
  }
}

export interface ShortestPath {
  distKm: number
  nodes: number[]
}

// Camino mas corto entre dos nodos (Dijkstra). Devuelve la secuencia de nodos
// y la distancia total en km. La rejilla esta completamente conectada, asi que
// siempre existe camino.
export function shortestPath(grid: Grid, from: number, to: number): ShortestPath {
  const n = grid.coords.length
  const dist = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  dist[from] = 0
  const pq = new MinHeap()
  pq.push([0, from])

  while (pq.size > 0) {
    const [d, u] = pq.pop() as [number, number]
    if (done[u]) continue
    done[u] = true
    if (u === to) break
    for (const { to: v, w } of grid.adjacency[u]) {
      const nd = d + w
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        pq.push([nd, v])
      }
    }
  }

  const nodes: number[] = []
  for (let at = to; at !== -1; at = prev[at]) nodes.push(at)
  nodes.reverse()
  return { distKm: dist[to], nodes }
}

// Aristas (pares de nodos consecutivos) de un camino.
export function pathEdges(nodes: number[]): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  for (let i = 0; i < nodes.length - 1; i += 1) edges.push([nodes[i], nodes[i + 1]])
  return edges
}

// Punto medio geografico de una arista: lo usamos para situar la incidencia
// "CORTADA" exactamente sobre el tramo de calle bloqueado.
export function edgeMidpoint(grid: Grid, a: number, b: number): LatLng {
  const [la, ga] = grid.coords[a]
  const [lb, gb] = grid.coords[b]
  return [(la + lb) / 2, (ga + gb) / 2]
}
