import { describe, expect, it } from 'vitest'
import { RoutableGraph, type OsmGraphData } from '../../../frontend/src/utils/osmGraph'
import type { IncidenciaRutaInput } from '../../../frontend/src/utils/geo'

// Grafo de calles en rejilla 3×3 (~111 m de lado) para probar el enrutamiento
// local sin depender de red ni IndexedDB.
//
//   0 — 1 — 2     índices de nodo
//   |   |   |
//   3 — 4 — 5
//   |   |   |
//   6 — 7 — 8
const LAT0 = 39.41
const LNG0 = -0.43
const STEP = 0.001

function coord(i: number, j: number): [number, number] {
  return [Number((LAT0 + i * STEP).toFixed(6)), Number((LNG0 + j * STEP).toFixed(6))]
}

function buildGridData(): OsmGraphData {
  const nodes: [number, number][] = []
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) nodes.push(coord(i, j))
  const id = (i: number, j: number) => i * 3 + j
  const edges: Array<[number, number]> = []
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      if (j + 1 < 3) edges.push([id(i, j), id(i, j + 1)])
      if (i + 1 < 3) edges.push([id(i, j), id(i + 1, j)])
    }
  }
  return { id: 'rejilla-test', bbox: [LAT0, LNG0, LAT0 + 2 * STEP, LNG0 + 2 * STEP], nodes, edges }
}

const ORIGEN = coord(0, 0) // nodo 0
const DESTINO = coord(0, 2) // nodo 2
// Corte en el punto medio de la arista 1—2 (fila superior).
const cortaArista12: IncidenciaRutaInput = {
  latitud: LAT0,
  longitud: LNG0 + 1.5 * STEP,
  estado: 'CORTADA',
}

describe('RoutableGraph (enrutamiento sobre grafo local)', () => {
  it('devuelve null si un waypoint cae fuera del extracto (→ fallback a OSRM)', () => {
    const g = new RoutableGraph(buildGridData())
    expect(g.route([ORIGEN, [40.5, 0.5]], [])).toBeNull()
  })

  it('calcula la ruta directa cuando no hay cortes', () => {
    const g = new RoutableGraph(buildGridData())
    const r = g.route([ORIGEN, DESTINO], [])
    expect(r).not.toBeNull()
    expect(r!.incidenciasCercanas).toBe(0)
    // Ruta directa: 0 → 1 → 2 (3 puntos)
    expect(r!.points).toHaveLength(3)
  })

  it('rodea un corte cuando existe alternativa (penalización blanda)', () => {
    const g = new RoutableGraph(buildGridData())
    const r = g.route([ORIGEN, DESTINO], [cortaArista12])
    expect(r).not.toBeNull()
    expect(r!.incidenciasCercanas).toBe(0) // esquiva el corte
    expect(r!.points.length).toBeGreaterThan(3) // ruta más larga (desvío)
  })

  it('si NO hay alternativa, cruza el corte en vez de dejar sin ruta (resiliencia)', () => {
    // Grafo lineal 0—1—2 sin caminos paralelos.
    const data: OsmGraphData = {
      id: 'linea-test',
      bbox: [LAT0, LNG0, LAT0, LNG0 + 2 * STEP],
      nodes: [coord(0, 0), coord(0, 1), coord(0, 2)],
      edges: [[0, 1], [1, 2]],
    }
    const g = new RoutableGraph(data)

    // Penalización blanda (finita): devuelve ruta aunque cruce el corte.
    const blanda = g.route([ORIGEN, DESTINO], [cortaArista12], 'driving', { penaltyFactor: 40 })
    expect(blanda).not.toBeNull()
    expect(blanda!.incidenciasCercanas).toBeGreaterThanOrEqual(1)

    // Exclusión estricta: no hay ruta → null (caería a OSRM).
    const estricta = g.route([ORIGEN, DESTINO], [cortaArista12], 'driving', { penaltyFactor: Infinity })
    expect(estricta).toBeNull()
  })

  it('sintetiza pasos de navegación (depart … arrive) cuando se piden', () => {
    const g = new RoutableGraph(buildGridData())
    const r = g.route([ORIGEN, DESTINO], [cortaArista12], 'driving', { conPasos: true })
    expect(r!.legs).toBeDefined()
    const steps = r!.legs![0].steps as Array<{ maneuver: { type: string } }>
    expect(steps[0].maneuver.type).toBe('depart')
    expect(steps[steps.length - 1].maneuver.type).toBe('arrive')
    // Debe haber al menos un giro por el desvío.
    expect(steps.length).toBeGreaterThan(2)
  })
})
