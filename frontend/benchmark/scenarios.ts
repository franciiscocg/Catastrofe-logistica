import {
  type Grid,
  type LatLng,
  edgeMidpoint,
  nodeId,
  pathEdges,
  shortestPath,
} from './grid'
import type { IncidenciaRutaInput } from '../src/utils/routing'

// ─────────────────────────────────────────────────────────────────────────────
// Generador de escenarios reproducible
//
// Un escenario = (origen, destino, conjunto de tramos CORTADOS). Para someter al
// algoritmo a una prueba exigente y bien motivada, los cortes NO se colocan al
// azar por el mapa (apenas afectarian a la ruta optima): se inyectan sobre la
// propia ruta optima origen->destino. Asi forzamos al algoritmo a esquivarlos,
// que es justo la capacidad que queremos medir.
//
// Todo depende de una semilla (PRNG mulberry32), de modo que la misma semilla
// reproduce exactamente los mismos escenarios y resultados.
// ─────────────────────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

// Baraja Fisher-Yates con el PRNG inyectado (reproducible).
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface Scenario {
  origen: LatLng
  destino: LatLng
  incidencias: IncidenciaRutaInput[]
  baselineDistKm: number
  baselineNodes: number[]
  nBlocks: number
}

// Distancia minima (en nodos del camino) entre origen y destino, para que haya
// recorrido suficiente donde colocar cortes y margen para desviarse.
const MIN_PATH_NODES = 14

function pickFarPair(grid: Grid, rng: () => number): { from: number; to: number; path: ReturnType<typeof shortestPath> } {
  for (let intento = 0; intento < 200; intento += 1) {
    // Origen en el borde oeste, destino en el borde este: garantiza recorrido.
    const fromI = randInt(rng, grid.rows)
    const toI = randInt(rng, grid.rows)
    const from = nodeId(fromI, randInt(rng, 4))
    const to = nodeId(toI, grid.cols - 1 - randInt(rng, 4))
    const path = shortestPath(grid, from, to)
    if (path.nodes.length >= MIN_PATH_NODES) return { from, to, path }
  }
  throw new Error('No se pudo generar un par origen/destino suficientemente separado')
}

export function generateScenario(grid: Grid, rng: () => number, nBlocks: number): Scenario {
  const { from, to, path } = pickFarPair(grid, rng)

  // Aristas candidatas para cortar: las de la ruta optima, excluyendo las dos
  // primeras y dos ultimas (no bloqueamos justo en el origen/destino).
  const edges = pathEdges(path.nodes)
  const interiores = edges.slice(2, Math.max(2, edges.length - 2))
  const elegidas = shuffle(rng, interiores).slice(0, Math.min(nBlocks, interiores.length))

  const incidencias: IncidenciaRutaInput[] = elegidas.map(([a, b]) => {
    const [latitud, longitud] = edgeMidpoint(grid, a, b)
    return { latitud, longitud, estado: 'CORTADA' as const }
  })

  return {
    origen: grid.coords[from],
    destino: grid.coords[to],
    incidencias,
    baselineDistKm: path.distKm,
    baselineNodes: path.nodes,
    nBlocks: incidencias.length,
  }
}

// Genera un lote de escenarios para una densidad de cortes dada.
export function generateBatch(
  grid: Grid,
  seed: number,
  nBlocks: number,
  count: number,
): Scenario[] {
  // Semilla derivada de (seed, nBlocks) para que cada densidad use su propia
  // secuencia pero el conjunto siga siendo reproducible a partir de `seed`.
  const rng = mulberry32(seed + nBlocks * 1_000_003)
  return Array.from({ length: count }, () => generateScenario(grid, rng, nBlocks))
}
