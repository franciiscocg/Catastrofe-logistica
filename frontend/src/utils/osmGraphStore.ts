import { db } from '@/lib/db'
import { RoutableGraph, type OsmGraphData } from './osmGraph'
import {
  registerLocalRouter,
  type IncidenciaRutaInput,
  type LocalRouter,
  type ModoTransporte,
  type RutaLocalResult,
} from './routing'

// ─────────────────────────────────────────────────────────────────────────────
// Carga, persistencia y registro del enrutamiento por grafo local.
//
// 1. Lee el manifiesto de extractos en /osm/manifest.json.
// 2. Para cada extracto: lo recupera de IndexedDB (offline) o de /osm/<id>.json
//    (lo cachea en IndexedDB tras la primera descarga).
// 3. Construye los grafos y registra un LocalRouter en routing.ts que elige el
//    grafo que cubre los waypoints. Si no hay ninguno, routing.ts usa OSRM.
//
// Es tolerante a fallos: si no hay manifiesto ni cache, no registra nada y la
// app sigue funcionando con OSRM. Nunca lanza en el arranque.
// ─────────────────────────────────────────────────────────────────────────────

interface Manifest {
  extractos: Array<{ id: string }>
}

let initPromise: Promise<RoutableGraph[]> | null = null
let grafosCargados: RoutableGraph[] = []

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function cargarExtracto(id: string): Promise<RoutableGraph | null> {
  // 1) Cache local (funciona offline)
  try {
    const cached = await db.osmGraphs.get(id)
    if (cached?.data) return new RoutableGraph(cached.data as OsmGraphData)
  } catch {
    /* IndexedDB no disponible: seguimos con la red */
  }

  // 2) Descarga y cacheo
  const data = await fetchJson<OsmGraphData>(`/osm/${id}.json`)
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null
  try {
    await db.osmGraphs.put({ id, data, cachedAt: Date.now() })
  } catch {
    /* si no se puede cachear, usamos el grafo en memoria igualmente */
  }
  return new RoutableGraph(data)
}

function construirLocalRouter(grafos: RoutableGraph[]): LocalRouter {
  return {
    route(
      waypoints: [number, number][],
      incidencias: IncidenciaRutaInput[],
      modo: ModoTransporte,
      opts?: { conPasos?: boolean },
    ): RutaLocalResult | null {
      const grafo = grafos.find((g) => waypoints.every((wp) => g.contains(wp)))
      if (!grafo) return null
      return grafo.route(waypoints, incidencias, modo, { conPasos: opts?.conPasos })
    },
  }
}

// Inicializa el enrutamiento local. Idempotente: una sola carga por sesion.
export function initLocalRouting(): Promise<RoutableGraph[]> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const manifest = await fetchJson<Manifest>('/osm/manifest.json')
    const ids = manifest?.extractos?.map((e) => e.id) ?? []

    // Sin manifiesto (p. ej. offline en frio): intentamos lo ya cacheado.
    let registros: string[] = ids
    if (registros.length === 0) {
      try {
        registros = (await db.osmGraphs.toArray()).map((r) => r.id)
      } catch {
        registros = []
      }
    }

    const grafos: RoutableGraph[] = []
    for (const id of registros) {
      const g = await cargarExtracto(id)
      if (g && g.size > 0) grafos.push(g)
    }

    grafosCargados = grafos
    registerLocalRouter(grafos.length > 0 ? construirLocalRouter(grafos) : null)
    return grafos
  })()

  return initPromise
}

// Estado para la UI (p. ej. indicar "navegacion offline disponible").
export function localRoutingStatus(): { disponible: boolean; zonas: string[] } {
  return { disponible: grafosCargados.length > 0, zonas: grafosCargados.map((g) => g.id) }
}
