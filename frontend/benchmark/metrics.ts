// ─────────────────────────────────────────────────────────────────────────────
// Metricas del benchmark comparativo
//
// Se evaluan tres estrategias sobre los MISMOS escenarios:
//   - 'heuristica'      : routing.ts actual (desvios via OSRM)
//   - 'grafo-dijkstra'  : ruta optima sobre el grafo de calles (Dijkstra)
//   - 'grafo-astar'     : igual, con A* (misma distancia, menos expansiones)
//
// Medimos eficacia (¿esquiva los cortes?), optimalidad (¿cuanto se aleja del
// optimo?) y coste (llamadas a OSRM, expansiones de nodos, latencia).
// ─────────────────────────────────────────────────────────────────────────────

export type Algoritmo = 'heuristica' | 'grafo-dijkstra' | 'grafo-astar'

export interface RunResult {
  scenarioId: number
  algoritmo: Algoritmo
  nBlocks: number
  baselineBlocks: number // cortes que cruza la ruta directa (control)
  blocksCrossed: number // cortes que cruza la ruta calculada
  resolved: boolean
  success: boolean // resolved && blocksCrossed === 0
  baselineDistKm: number
  routeDistKm: number | null
  optimalDistKm: number | null // optimo consciente de cortes (referencia: grafo)
  detourPct: number | null // % extra frente a la ruta directa
  optimalityGapPct: number | null // % extra frente al optimo
  osrmCalls: number // coste de red (heuristica)
  expansions: number // coste algoritmico (grafo)
  latencyMs: number
}

export interface Aggregate {
  algoritmo: Algoritmo
  nBlocks: number
  n: number
  resolveRate: number
  successRate: number
  meanDetourPct: number | null
  meanOptimalityGapPct: number | null
  maxOptimalityGapPct: number | null
  meanOsrmCalls: number
  maxOsrmCalls: number
  meanExpansions: number
  maxExpansions: number
  meanLatencyMs: number
  meanBaselineBlocks: number
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function meanDefined(xs: Array<number | null>): number | null {
  const vals = xs.filter((x): x is number => x !== null)
  return vals.length ? mean(vals) : null
}

function maxDefined(xs: Array<number | null>): number | null {
  const vals = xs.filter((x): x is number => x !== null)
  return vals.length ? Math.max(...vals) : null
}

export function aggregate(results: RunResult[]): Aggregate[] {
  const grupos = new Map<string, RunResult[]>()
  for (const r of results) {
    const key = `${r.algoritmo}|${r.nBlocks}`
    const arr = grupos.get(key) ?? []
    arr.push(r)
    grupos.set(key, arr)
  }

  return [...grupos.values()]
    .map((rs) => {
      const resueltos = rs.filter((r) => r.resolved)
      const exitos = rs.filter((r) => r.success)
      return {
        algoritmo: rs[0].algoritmo,
        nBlocks: rs[0].nBlocks,
        n: rs.length,
        resolveRate: resueltos.length / rs.length,
        successRate: exitos.length / rs.length,
        meanDetourPct: meanDefined(exitos.map((r) => r.detourPct)),
        meanOptimalityGapPct: meanDefined(exitos.map((r) => r.optimalityGapPct)),
        maxOptimalityGapPct: maxDefined(exitos.map((r) => r.optimalityGapPct)),
        meanOsrmCalls: mean(rs.map((r) => r.osrmCalls)),
        maxOsrmCalls: Math.max(...rs.map((r) => r.osrmCalls)),
        meanExpansions: mean(rs.map((r) => r.expansions)),
        maxExpansions: Math.max(...rs.map((r) => r.expansions)),
        meanLatencyMs: mean(rs.map((r) => r.latencyMs)),
        meanBaselineBlocks: mean(rs.map((r) => r.baselineBlocks)),
      }
    })
    .sort((a, b) => a.algoritmo.localeCompare(b.algoritmo) || a.nBlocks - b.nBlocks)
}

// Filtra los agregados de un algoritmo, ordenados por densidad de cortes.
export function porAlgoritmo(agg: Aggregate[], algoritmo: Algoritmo): Aggregate[] {
  return agg.filter((a) => a.algoritmo === algoritmo).sort((a, b) => a.nBlocks - b.nBlocks)
}
