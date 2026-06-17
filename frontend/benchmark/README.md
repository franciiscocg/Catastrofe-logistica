# Banco de pruebas del algoritmo de enrutamiento

Evaluación experimental reproducible del enrutamiento que calcula rutas **evitando
vías cortadas** (la aportación diferencial del proyecto). Compara **tres
estrategias** sobre los mismos escenarios:

1. **Heurística** ([`routing.ts`](../src/utils/routing.ts)) — desvíos vía OSRM
   (implementación actual de la app).
2. **Grafo · Dijkstra** ([`graphRouting.ts`](./graphRouting.ts)) — ruta óptima
   sobre el grafo de calles excluyendo aristas cortadas.
3. **Grafo · A\*** — igual que Dijkstra con heurística haversine (misma distancia
   óptima, menos nodos explorados).

## Cómo ejecutarlo

```bash
cd frontend
npm run bench
```

Genera en [`resultados/`](./resultados):

| Artefacto | Contenido |
| --- | --- |
| `resumen.md` | Metodología + tablas de resultados + figuras (listo para la memoria). |
| `raw.csv` | Una fila por escenario (datos crudos para reanálisis). |
| `*.svg` | Figuras: eficacia, rodeo y coste frente a la densidad de cortes. |

## Diseño experimental (por qué es defendible)

- **Determinista y offline.** No se contacta con OSRM real: un *mock* calcula el
  camino más corto (Dijkstra) sobre una **rejilla de calles sintética**
  (25 × 25 cruces, aristas ponderadas por distancia haversine real, centrada en
  Paiporta). La misma semilla reproduce exactamente los mismos resultados.
- **Se evalúa el código real, sin tocarlo.** El benchmark redirige el `fetch`
  global al mock; `fetchRutaMultiParada` / `findSafeRoute` se ejecutan tal cual
  corren en producción. El mock **no conoce los cortes** —igual que OSRM real—,
  así que toda la inteligencia de evasión es del algoritmo bajo prueba.
- **Caso exigente.** Los cortes se inyectan **sobre la ruta óptima**
  origen→destino, forzando la evasión. Un control valida que la ruta directa
  cruza exactamente tantos cortes como se inyectaron.

## Métricas

- **Tasa de resolución / éxito** — % que devuelve ruta / % que devuelve ruta con
  **0 cortes cruzados**.
- **Rodeo** — distancia extra (%) frente a la ruta directa.
- **Llamadas a OSRM** y **latencia** — coste computacional y dependencia del
  servicio externo.

## Estructura

| Archivo | Rol |
| --- | --- |
| `grid.ts` | Red de calles sintética + Dijkstra (verdad de terreno). |
| `osrmMock.ts` | Mock determinista de OSRM sobre la rejilla. |
| `scenarios.ts` | Generación reproducible de escenarios (PRNG con semilla). |
| `graphRouting.ts` | Enrutamiento sobre grafo (Dijkstra / A\*) con exclusión o penalización de aristas cortadas. |
| `metrics.ts` | Definición y agregación de métricas comparativas. |
| `report.ts` | CSV, tablas markdown y figuras SVG (sin dependencias). |
| `run.ts` | Orquestación de la comparativa de las tres estrategias. |
| `benchmark.test.ts` | Ejecuta el benchmark y valida invariantes (regresión). |
