# Enrutamiento que evita vías cortadas

Sistema de cálculo de rutas que esquiva las vías reportadas como **CORTADAS**,
diseñado para funcionar **también sin conexión** durante una catástrofe.

## Arquitectura híbrida (local-first con fallback)

La app calcula rutas a través de tres funciones en
[`frontend/src/utils/routing.ts`](frontend/src/utils/routing.ts)
(`fetchRutaEvitandoIncidencias`, `fetchRutaMultiParada`, `fetchRutaConPasos`).
Cada una sigue la misma estrategia **local-first**:

1. **Grafo de calles local (offline).** Si hay un extracto OSM cargado que cubre
   los waypoints, se enruta sobre él con A\* y **penalización blanda** de las
   aristas cortadas (ver más abajo). No requiere red.
2. **Fallback a OSRM (online).** Si no hay grafo local para esa zona, se usa el
   motor OSRM con la heurística de desvíos previa.

La selección es transparente para la UI: las firmas de las funciones no cambian.
El grafo local se inyecta por **inversión de dependencias**
(`registerLocalRouter`), de modo que `routing.ts` no depende de IndexedDB y el
banco de pruebas/los tests siguen ejercitando solo OSRM.

```
UI  ──▶  routing.ts  ──▶  ¿grafo local cubre la zona?
                              │ sí ──▶ osmGraph.ts (A* + penalización blanda)   [OFFLINE]
                              │ no ──▶ OSRM (heurística de desvíos)             [ONLINE]
```

## Componentes

| Archivo | Rol |
| --- | --- |
| [`utils/geo.ts`](frontend/src/utils/geo.ts) | Primitivas geométricas y detección de cortes (radio 25 m). |
| [`utils/routing.ts`](frontend/src/utils/routing.ts) | Orquestación local-first + heurística OSRM. |
| [`utils/osmGraph.ts`](frontend/src/utils/osmGraph.ts) | `RoutableGraph`: A\*/Dijkstra sobre el grafo, snapping espacial y síntesis de pasos de navegación. |
| [`utils/osmGraphStore.ts`](frontend/src/utils/osmGraphStore.ts) | Carga del extracto (red → IndexedDB), registro del enrutador local. |
| [`scripts/fetch-osm-graph.mjs`](frontend/scripts/fetch-osm-graph.mjs) | Genera el extracto OSM de una zona vía Overpass. |

## Penalización blanda (resiliencia)

Las aristas cortadas no se eliminan del grafo: se **penalizan** (coste ×40 por
defecto). Así, si la única forma de llegar atraviesa un corte, la app devuelve esa
ruta (avisando) en lugar de dejar al usuario sin salida. La exclusión estricta
(coste ∞) está disponible como opción.

## Funcionamiento offline

1. Al arrancar, [`initLocalRouting()`](frontend/src/utils/osmGraphStore.ts) lee
   `public/osm/manifest.json` y carga los extractos.
2. Cada extracto se **cachea en IndexedDB** (tabla `osmGraphs`) y en el Service
   Worker (`runtimeCaching` de `/osm/`), por lo que tras la primera carga el
   enrutamiento funciona sin red.

## Generar el extracto de una zona

```bash
cd frontend
npm run osm:fetch -- --id paiporta --bbox 39.41,-0.43,39.44,-0.40 --nombre "Paiporta"
```

Genera `public/osm/<id>.json` y actualiza el manifiesto. El repositorio incluye
el extracto de Paiporta (zona de la DANA de Valencia 2024) como ejemplo.

## Evaluación experimental

La elección del enfoque de grafo está respaldada por un banco de pruebas
reproducible que compara las tres estrategias (heurística vs grafo Dijkstra/A\*):
ver [`frontend/benchmark/`](frontend/benchmark/) y su informe
[`resultados/resumen.md`](frontend/benchmark/resultados/resumen.md).

Resumen: el grafo es **óptimo** (0 % de rodeo innecesario), **100 % de éxito**
esquivando cortes y **sin llamadas de red**, frente a la heurística (rodeo 5-13 %,
90-100 % de éxito y hasta ~4000 llamadas a OSRM con muchos cortes). El coste a
asumir es disponer del mapa OSM de la zona en local.
