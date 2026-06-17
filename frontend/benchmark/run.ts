import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildGrid, type Grid, type LatLng } from './grid'
import { createOsrmMock, type OsrmMock } from './osrmMock'
import { generateBatch, type Scenario } from './scenarios'
import { aggregate, type Aggregate, type RunResult } from './metrics'
import { graphRoute } from './graphRouting'
import { writeReport } from './report'
import { countBlockedIncidenciasNearRoute, fetchRutaMultiParada } from '../src/utils/routing'

// ─────────────────────────────────────────────────────────────────────────────
// Orquestacion del benchmark comparativo: heuristica (OSRM) vs grafo (Dijkstra/A*).
// ─────────────────────────────────────────────────────────────────────────────

export interface BenchConfig {
  seed: number
  escenariosPorDensidad: number
  densidades: number[]
}

export const DEFAULT_CONFIG: BenchConfig = {
  seed: 20241029, // fecha de la DANA de Valencia
  escenariosPorDensidad: 30,
  densidades: [0, 1, 2, 3, 4],
}

function pct(num: number | null, den: number): number | null {
  if (num === null || den <= 0) return null
  return (num / den) * 100
}

async function runScenario(
  grid: Grid,
  mock: OsrmMock,
  sc: Scenario,
  scenarioId: number,
): Promise<RunResult[]> {
  // Control: cuantos cortes cruza la ruta directa (sin evasion).
  const baselinePoints = sc.baselineNodes.map((id) => grid.coords[id])
  const baselineBlocks = countBlockedIncidenciasNearRoute(baselinePoints, sc.incidencias)

  // Optimo de referencia: ruta sobre grafo que excluye las aristas cortadas.
  const optimo = graphRoute(grid, sc.origen, sc.destino, sc.incidencias, { mode: 'dijkstra' })
  const optimalDistKm = optimo.resolved ? (optimo.distKm as number) : null

  const base = {
    scenarioId,
    nBlocks: sc.nBlocks,
    baselineBlocks,
    baselineDistKm: sc.baselineDistKm,
    optimalDistKm,
  }

  const results: RunResult[] = []

  // ── 1) Heuristica actual (desvios via OSRM) ────────────────────────────────
  mock.reset()
  {
    const t0 = performance.now()
    let resolved = false
    let blocksCrossed = sc.incidencias.length
    let routeDistKm: number | null = null
    try {
      const res = await fetchRutaMultiParada([sc.origen, sc.destino], sc.incidencias)
      resolved = true
      blocksCrossed = res.incidenciasCercanas
      routeDistKm = res.distanciaKm
    } catch {
      resolved = false
    }
    const latencyMs = performance.now() - t0
    results.push({
      ...base,
      algoritmo: 'heuristica',
      blocksCrossed,
      resolved,
      success: resolved && blocksCrossed === 0,
      routeDistKm,
      detourPct: resolved ? pct((routeDistKm as number) - sc.baselineDistKm, sc.baselineDistKm) : null,
      optimalityGapPct:
        resolved && optimalDistKm ? pct((routeDistKm as number) - optimalDistKm, optimalDistKm) : null,
      osrmCalls: mock.callCount(),
      expansions: 0,
      latencyMs,
    })
  }

  // ── 2) y 3) Grafo: Dijkstra y A* (excluyen aristas cortadas) ───────────────
  for (const mode of ['dijkstra', 'astar'] as const) {
    const t0 = performance.now()
    const r = graphRoute(grid, sc.origen, sc.destino, sc.incidencias, { mode })
    const latencyMs = performance.now() - t0
    const blocksCrossed = r.resolved ? countBlockedIncidenciasNearRoute(r.points, sc.incidencias) : sc.incidencias.length
    results.push({
      ...base,
      algoritmo: mode === 'dijkstra' ? 'grafo-dijkstra' : 'grafo-astar',
      blocksCrossed,
      resolved: r.resolved,
      success: r.resolved && blocksCrossed === 0,
      routeDistKm: r.distKm,
      detourPct: r.resolved ? pct((r.distKm as number) - sc.baselineDistKm, sc.baselineDistKm) : null,
      optimalityGapPct:
        r.resolved && optimalDistKm ? pct((r.distKm as number) - optimalDistKm, optimalDistKm) : null,
      osrmCalls: 0,
      expansions: r.expansions,
      latencyMs,
    })
  }

  return results
}

export async function runBenchmark(
  cfg: BenchConfig = DEFAULT_CONFIG,
): Promise<{ results: RunResult[]; agg: Aggregate[]; grid: Grid }> {
  const grid = buildGrid()
  const mock = createOsrmMock(grid)
  // El algoritmo heuristico usa el `fetch` global: lo redirigimos al mock.
  ;(globalThis as { fetch: unknown }).fetch = mock.fetch

  const results: RunResult[] = []
  let scenarioId = 0
  for (const d of cfg.densidades) {
    const lote = generateBatch(grid, cfg.seed, d, cfg.escenariosPorDensidad)
    for (const sc of lote) {
      results.push(...(await runScenario(grid, mock, sc, scenarioId)))
      scenarioId += 1
    }
  }

  return { results, agg: aggregate(results), grid }
}

export function writeArtifacts(
  outDir: string,
  results: RunResult[],
  agg: Aggregate[],
  cfg: BenchConfig,
): void {
  mkdirSync(outDir, { recursive: true })
  writeReport(outDir, results, agg, cfg)
}

// Permite ejecutar directamente con `vite-node benchmark/run.ts` ademas de via
// el test de vitest.
const ejecutadoDirectamente =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (ejecutadoDirectamente) {
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), 'resultados')
  runBenchmark().then(({ results, agg }) => {
    writeArtifacts(outDir, results, agg, DEFAULT_CONFIG)
    // eslint-disable-next-line no-console
    console.log(`Benchmark completado: ${results.length} ejecuciones. Resultados en ${outDir}`)
  })
}

export type { LatLng }
