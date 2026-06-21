import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { type Aggregate, type Algoritmo, type RunResult, porAlgoritmo } from './metrics'
import type { BenchConfig } from './run'

// ─────────────────────────────────────────────────────────────────────────────
// Genera los artefactos comparativos para la memoria: CSV, resumen markdown y
// figuras SVG. Sin dependencias externas (reproducible con `npm run bench`).
// ─────────────────────────────────────────────────────────────────────────────

const ETIQUETA: Record<Algoritmo, string> = {
  heuristica: 'Heurística (desvíos vía OSRM)',
  'grafo-dijkstra': 'Grafo · Dijkstra',
  'grafo-astar': 'Grafo · A*',
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`
const num = (x: number, d = 1) => x.toFixed(d)
const opt = (x: number | null, suffix = '', d = 1) => (x === null ? '—' : `${x.toFixed(d)}${suffix}`)

export function toCsv(results: RunResult[]): string {
  const header = [
    'scenarioId', 'algoritmo', 'nBlocks', 'baselineBlocks', 'blocksCrossed',
    'resolved', 'success', 'baselineDistKm', 'routeDistKm', 'optimalDistKm',
    'detourPct', 'optimalityGapPct', 'osrmCalls', 'expansions', 'latencyMs',
  ].join(',')

  const rows = results.map((r) => [
    r.scenarioId,
    r.algoritmo,
    r.nBlocks,
    r.baselineBlocks,
    r.blocksCrossed,
    r.resolved ? 1 : 0,
    r.success ? 1 : 0,
    r.baselineDistKm.toFixed(4),
    r.routeDistKm === null ? '' : r.routeDistKm.toFixed(4),
    r.optimalDistKm === null ? '' : r.optimalDistKm.toFixed(4),
    r.detourPct === null ? '' : r.detourPct.toFixed(2),
    r.optimalityGapPct === null ? '' : r.optimalityGapPct.toFixed(2),
    r.osrmCalls,
    r.expansions,
    r.latencyMs.toFixed(3),
  ].join(','))

  return [header, ...rows].join('\n')
}

// Tabla de resultados de un algoritmo (coste = OSRM o expansiones segun el caso).
function tablaAlgoritmo(agg: Aggregate[], algoritmo: Algoritmo): string {
  const filas = porAlgoritmo(agg, algoritmo).map((a) => {
    const coste = algoritmo === 'heuristica'
      ? `${num(a.meanOsrmCalls)} / ${a.maxOsrmCalls}`
      : `${num(a.meanExpansions)} / ${a.maxExpansions}`
    return `| ${a.nBlocks} | ${pct(a.successRate)} | ${opt(a.meanDetourPct, ' %')} | ${opt(a.meanOptimalityGapPct, ' %')} | ${coste} | ${num(a.meanLatencyMs, 2)} |`
  }).join('\n')

  const costeHeader = algoritmo === 'heuristica' ? 'Llamadas OSRM (media/máx)' : 'Expansiones (media/máx)'
  return `| Cortes | T. éxito | Rodeo medio | Gap óptimo | ${costeHeader} | Latencia (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
${filas}`
}

function tablaComparativa(agg: Aggregate[]): string {
  const h = porAlgoritmo(agg, 'heuristica')
  const d = porAlgoritmo(agg, 'grafo-dijkstra')
  const a = porAlgoritmo(agg, 'grafo-astar')

  const filas = h.map((ha, i) => {
    const speedup = a[i].meanLatencyMs > 0 ? ha.meanLatencyMs / a[i].meanLatencyMs : 0
    return `| ${ha.nBlocks} | ${pct(ha.successRate)} | ${pct(d[i].successRate)} | ${opt(ha.meanOptimalityGapPct, ' %')} | ${num(ha.meanOsrmCalls)} | ${num(a[i].meanExpansions)} | ${num(d[i].meanExpansions)} | ×${num(speedup, 1)} |`
  }).join('\n')

  return `| Cortes | Éxito heur. | Éxito grafo | Gap heur. vs óptimo | OSRM (heur.) | Expansiones A* | Expansiones Dijkstra | Speedup latencia (heur./A*) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${filas}`
}

export function toMarkdown(agg: Aggregate[], cfg: BenchConfig): string {
  return `# Comparativa de algoritmos de enrutamiento que evitan vías cortadas

> Generado automáticamente por \`npm run bench\`. No editar a mano.

Se comparan tres estrategias sobre los **mismos** escenarios:

1. **Heurística (actual)** — [\`routing.ts\`](../src/utils/routing.ts): pide rutas a
   OSRM e inserta waypoints de desvío hasta esquivar los cortes.
2. **Grafo · Dijkstra** — [\`graphRouting.ts\`](../graphRouting.ts): ruta óptima
   sobre el grafo de calles excluyendo las aristas cortadas.
3. **Grafo · A\*** — igual que Dijkstra pero con heurística haversine admisible
   (misma distancia óptima, menos nodos explorados).

## Metodología

Entorno **determinista y offline**: rejilla de 25 × 25 cruces (aristas
ponderadas por distancia haversine real, centro en Paiporta) como red de calles.
El mock de OSRM resuelve el camino más corto sobre esa rejilla sin conocer los
cortes (igual que OSRM real). Por cada densidad se generan
**${cfg.escenariosPorDensidad} escenarios** con semilla fija (\`seed = ${cfg.seed}\`),
inyectando los cortes **sobre la ruta óptima** origen→destino (caso exigente).

**Métricas:** *tasa de éxito* (ruta con 0 cortes cruzados), *rodeo* (% extra
frente a la ruta directa), *gap de optimalidad* (% extra frente a la ruta óptima
consciente de cortes = referencia del grafo), y *coste* (llamadas a OSRM para la
heurística; expansiones de nodos para el grafo).

## Comparativa directa

${tablaComparativa(agg)}

## Resultados por estrategia

### ${ETIQUETA.heuristica}

${tablaAlgoritmo(agg, 'heuristica')}

### ${ETIQUETA['grafo-dijkstra']}

${tablaAlgoritmo(agg, 'grafo-dijkstra')}

### ${ETIQUETA['grafo-astar']}

${tablaAlgoritmo(agg, 'grafo-astar')}

## Figuras

![Tasa de éxito por estrategia](comparativa-exito.svg)

![Gap de optimalidad de la heurística](comparativa-optimalidad.svg)

![Coste algorítmico: A* vs Dijkstra](comparativa-coste-grafo.svg)

![Coste de red de la heurística (llamadas a OSRM)](heuristica-coste-osrm.svg)

## Análisis: ventajas y desventajas

### Heurística (desvíos vía OSRM) — la implementación actual

**Ventajas**
- **No necesita el grafo de calles en local:** delega el enrutamiento real en
  OSRM. Footprint de datos mínimo, ideal para una PWA offline-first que no puede
  embarcar un extracto OSM completo.
- Reaprovecha un motor de rutas maduro (restricciones de giro, sentidos, perfiles
  *driving*/*foot*) sin reimplementarlo.

**Desventajas**
- **No garantiza optimalidad:** explora desvíos predefinidos; la ruta resultante
  puede alejarse del óptimo (ver columna *gap*).
- **Coste de red que crece de forma combinatoria** con el número de cortes
  (waypoints de desvío × combinaciones): es el principal cuello de botella y, en
  campo, depende de la conectividad —justo lo que falla en una catástrofe—.
- Puede **no encontrar ruta** aunque exista (cae por debajo del 100 % de éxito).

### Grafo (Dijkstra / A\*) — la propuesta

**Ventajas**
- **Óptima por construcción:** Dijkstra/A\* devuelven la ruta más corta que
  respeta los cortes (gap de optimalidad = 0).
- **Cero llamadas externas:** todo el cálculo es local → funciona sin red, que es
  el escenario objetivo del proyecto.
- **Coste predecible y bajo:** lineal-logarítmico en el tamaño del grafo, estable
  frente al número de cortes (a diferencia de la explosión de la heurística).
- **A\*** reduce las expansiones frente a Dijkstra manteniendo la optimalidad.
- Soporta **penalización blanda** de aristas cortadas (cruzar un corte solo si no
  hay alternativa) → nunca deja al usuario sin ruta.

**Desventajas**
- **Requiere el grafo de calles en local** (extracto OSM, almacenamiento y
  actualización): es el coste real de adoptarla.
- Reimplementar restricciones de tráfico (giros, sentidos) tiene complejidad
  propia; el benchmark usa una rejilla no dirigida.

### Conclusión

El grafo gana en **optimalidad, coste y disponibilidad offline**; la heurística
gana en **simplicidad de datos**. Para el dominio del proyecto —operación sin red
durante catástrofes— el enfoque de grafo (con penalización blanda como red de
seguridad) es preferible, asumiendo el coste de embarcar el mapa de la zona
afectada. Una arquitectura híbrida (grafo local cuando hay mapa, OSRM cuando hay
red) captura lo mejor de ambos.
`
}

// ── Figuras SVG (sin dependencias) ───────────────────────────────────────────

interface Serie {
  nombre: string
  color: string
  puntos: Array<{ x: number; y: number }>
}

export function lineChartSvg(opts: {
  titulo: string
  ejeX: string
  ejeY: string
  series: Serie[]
  yMin?: number
  yMax?: number
}): string {
  const W = 680
  const H = 400
  const m = { top: 50, right: 24, bottom: 56, left: 70 }
  const plotW = W - m.left - m.right
  const plotH = H - m.top - m.bottom

  const allX = opts.series.flatMap((s) => s.puntos.map((p) => p.x))
  const allY = opts.series.flatMap((s) => s.puntos.map((p) => p.y))
  const xMin = Math.min(...allX)
  const xMax = Math.max(...allX)
  const yMin = opts.yMin ?? Math.min(0, ...allY)
  const yMax = opts.yMax ?? (Math.max(...allY) * 1.1 || 1)

  const sx = (x: number) => m.left + ((x - xMin) / (xMax - xMin || 1)) * plotW
  const sy = (y: number) => m.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH

  const yTicks = 5
  const gridY: string[] = []
  const yLabels: string[] = []
  for (let i = 0; i <= yTicks; i += 1) {
    const v = yMin + ((yMax - yMin) * i) / yTicks
    const y = sy(v)
    gridY.push(`<line x1="${m.left}" y1="${y.toFixed(1)}" x2="${(W - m.right).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>`)
    const label = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 10 ? 1 : 0)
    yLabels.push(`<text x="${m.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="#374151">${label}</text>`)
  }

  const xLabels: string[] = []
  for (const x of [...new Set(allX)].sort((a, b) => a - b)) {
    xLabels.push(`<text x="${sx(x).toFixed(1)}" y="${(m.top + plotH + 22).toFixed(1)}" text-anchor="middle" font-size="12" fill="#374151">${x}</text>`)
  }

  const polylines = opts.series
    .map((s) => {
      const pts = s.puntos.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
      const dots = s.puntos
        .map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="${s.color}"/>`)
        .join('')
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5"/>${dots}`
    })
    .join('')

  const legend = opts.series
    .map((s, i) => {
      const x = m.left + i * 215
      const y = H - 14
      return `<rect x="${x}" y="${y - 10}" width="14" height="14" fill="${s.color}" rx="2"/><text x="${x + 20}" y="${y + 1}" font-size="12" fill="#111827">${s.nombre}</text>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${W / 2}" y="28" text-anchor="middle" font-size="16" font-weight="600" fill="#111827">${opts.titulo}</text>
  ${gridY.join('\n  ')}
  <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#9ca3af" stroke-width="1"/>
  <line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#9ca3af" stroke-width="1"/>
  ${yLabels.join('\n  ')}
  ${xLabels.join('\n  ')}
  <text x="${W / 2}" y="${H - 32}" text-anchor="middle" font-size="13" fill="#111827">${opts.ejeX}</text>
  <text x="18" y="${m.top + plotH / 2}" text-anchor="middle" font-size="13" fill="#111827" transform="rotate(-90 18 ${m.top + plotH / 2})">${opts.ejeY}</text>
  ${polylines}
  ${legend}
</svg>`
}

export function writeReport(
  outDir: string,
  results: RunResult[],
  agg: Aggregate[],
  cfg: BenchConfig,
): void {
  writeFileSync(resolve(outDir, 'raw.csv'), toCsv(results), 'utf8')
  writeFileSync(resolve(outDir, 'resumen.md'), toMarkdown(agg, cfg), 'utf8')

  const h = porAlgoritmo(agg, 'heuristica')
  const d = porAlgoritmo(agg, 'grafo-dijkstra')
  const a = porAlgoritmo(agg, 'grafo-astar')

  writeFileSync(
    resolve(outDir, 'comparativa-exito.svg'),
    lineChartSvg({
      titulo: 'Tasa de éxito por estrategia',
      ejeX: 'Número de cortes en la ruta óptima',
      ejeY: 'Tasa de éxito (%)',
      yMin: 0,
      yMax: 105,
      series: [
        { nombre: 'Heurística', color: '#2563eb', puntos: h.map((x) => ({ x: x.nBlocks, y: x.successRate * 100 })) },
        { nombre: 'Grafo (Dijkstra/A*)', color: '#16a34a', puntos: d.map((x) => ({ x: x.nBlocks, y: x.successRate * 100 })) },
      ],
    }),
    'utf8',
  )

  writeFileSync(
    resolve(outDir, 'comparativa-optimalidad.svg'),
    lineChartSvg({
      titulo: 'Gap de optimalidad frente al óptimo',
      ejeX: 'Número de cortes en la ruta óptima',
      ejeY: 'Distancia extra vs óptimo (%)',
      yMin: 0,
      series: [
        { nombre: 'Heurística', color: '#2563eb', puntos: h.filter((x) => x.meanOptimalityGapPct !== null).map((x) => ({ x: x.nBlocks, y: x.meanOptimalityGapPct as number })) },
        { nombre: 'Grafo (óptimo = 0)', color: '#16a34a', puntos: d.map((x) => ({ x: x.nBlocks, y: x.meanOptimalityGapPct ?? 0 })) },
      ],
    }),
    'utf8',
  )

  writeFileSync(
    resolve(outDir, 'comparativa-coste-grafo.svg'),
    lineChartSvg({
      titulo: 'Coste algorítmico: A* vs Dijkstra',
      ejeX: 'Número de cortes en la ruta óptima',
      ejeY: 'Nodos expandidos (media)',
      yMin: 0,
      series: [
        { nombre: 'Dijkstra', color: '#7c3aed', puntos: d.map((x) => ({ x: x.nBlocks, y: x.meanExpansions })) },
        { nombre: 'A*', color: '#16a34a', puntos: a.map((x) => ({ x: x.nBlocks, y: x.meanExpansions })) },
      ],
    }),
    'utf8',
  )

  writeFileSync(
    resolve(outDir, 'heuristica-coste-osrm.svg'),
    lineChartSvg({
      titulo: 'Coste de red de la heurística (llamadas a OSRM)',
      ejeX: 'Número de cortes en la ruta óptima',
      ejeY: 'Llamadas a OSRM por escenario',
      yMin: 0,
      series: [
        { nombre: 'Media', color: '#2563eb', puntos: h.map((x) => ({ x: x.nBlocks, y: x.meanOsrmCalls })) },
        { nombre: 'Máximo', color: '#dc2626', puntos: h.map((x) => ({ x: x.nBlocks, y: x.maxOsrmCalls })) },
      ],
    }),
    'utf8',
  )
}
