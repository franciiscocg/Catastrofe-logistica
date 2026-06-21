import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, runBenchmark, writeArtifacts } from './run'
import { porAlgoritmo } from './metrics'

// Ejecuta el benchmark comparativo (heurística vs grafo Dijkstra/A*), escribe los
// artefactos (CSV, resumen, figuras) y valida los invariantes. Dobla como test de
// regresión del algoritmo de enrutamiento.

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'resultados')

describe('comparativa de enrutamiento que evita vías cortadas', () => {
  it('ejecuta las tres estrategias, genera artefactos y cumple los invariantes', async () => {
    const { results, agg } = await runBenchmark(DEFAULT_CONFIG)
    writeArtifacts(OUT_DIR, results, agg, DEFAULT_CONFIG)

    const total = DEFAULT_CONFIG.densidades.length * DEFAULT_CONFIG.escenariosPorDensidad * 3
    expect(results).toHaveLength(total)

    const heur = porAlgoritmo(agg, 'heuristica')
    const dij = porAlgoritmo(agg, 'grafo-dijkstra')
    const ast = porAlgoritmo(agg, 'grafo-astar')

    // Control del banco de pruebas: la ruta directa cruza exactamente los cortes
    // inyectados (confirma que los escenarios obstruyen la ruta óptima).
    for (const a of heur) {
      expect(a.meanBaselineBlocks).toBeCloseTo(a.nBlocks, 5)
    }

    // El grafo es óptimo por construcción: gap 0 y resuelve siempre (la rejilla
    // no se desconecta al cortar unas pocas aristas).
    for (const a of dij) {
      expect(a.successRate).toBeGreaterThanOrEqual(0.95)
      expect(a.meanOptimalityGapPct ?? 0).toBeCloseTo(0, 6)
    }

    // A* da la misma distancia óptima que Dijkstra...
    for (const a of ast) {
      expect(a.meanOptimalityGapPct ?? 0).toBeCloseTo(0, 6)
    }
    // ...explorando como mucho los mismos nodos (normalmente menos).
    for (let i = 0; i < dij.length; i += 1) {
      expect(ast[i].meanExpansions).toBeLessThanOrEqual(dij[i].meanExpansions + 1e-9)
    }

    // La heurística nunca mejora al óptimo (gap >= 0) y, sin cortes, hace 1 sola
    // llamada a OSRM sin rodeo.
    for (const a of heur) {
      expect(a.meanOptimalityGapPct ?? 0).toBeGreaterThanOrEqual(-1e-6)
    }
    const h0 = heur.find((a) => a.nBlocks === 0)!
    expect(h0.successRate).toBe(1)
    expect(h0.meanOsrmCalls).toBeCloseTo(1, 5)

    // El coste de red de la heurística crece con la densidad de cortes; el coste
    // del grafo (expansiones) se mantiene acotado.
    const h4 = heur.find((a) => a.nBlocks === 4)!
    const h1 = heur.find((a) => a.nBlocks === 1)!
    expect(h4.meanOsrmCalls).toBeGreaterThan(h1.meanOsrmCalls)
    const d4 = dij.find((a) => a.nBlocks === 4)!
    expect(h4.meanOsrmCalls).toBeGreaterThan(d4.meanExpansions)
  }, 180_000)
})
