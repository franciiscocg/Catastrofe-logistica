import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Map, { type IncidenciaAction, type IncidenciaMarker, type PuestoMarker } from '@/components/shared/Map'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useGeolocation } from '@/hooks/useGeolocation'
import { sortByDistance } from '@/utils/haversine'
import {
  countBlockedIncidenciasNearRoute,
  blockedIncidenciasNearRoute,
} from '@/utils/routing'
import {
  getProductosDisponibles as _getProductosDisponibles,
  getProductoOptions as _getProductoOptions,
} from '@/utils/productos'
import { apiClient } from '@/lib/api/client'
import { useSyncStore } from '@/store/sync.store'
import { fetchRutaEvitandoIncidencias as fetchRutaSegura } from '@/utils/routing'

// PUESTOS_BASE ya no se usa — los puestos vienen de la API (/api/puestos)

type ItemInventario = { nombre: string; categoria: string; cantidad: number; unidad: string }
// Re-export alias para compatibilidad con el resto del fichero

const INVENTARIO: Record<string, { disponible: ItemInventario[]; necesario: ItemInventario[] }> = {
  '1': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 240, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 80,  unidad: 'kg'         },
      { nombre: 'Mantas',                  categoria: 'Abrigo',        cantidad: 15,  unidad: 'unidades'   },
    ],
    necesario: [
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 0,   unidad: 'kits'       },
      { nombre: 'Ropa de abrigo (M/L)',    categoria: 'Ropa',          cantidad: 0,   unidad: 'prendas'    },
      { nombre: 'Pañales talla 3-5',       categoria: 'Bebés',         cantidad: 0,   unidad: 'paquetes'   },
      { nombre: 'Linternas y pilas',       categoria: 'Equipamiento',  cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '2': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 320, unidad: 'litros'    },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 60,  unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 45,  unidad: 'kits'       },
    ],
    necesario: [
      { nombre: 'Alimentos infantiles',    categoria: 'Alimentación',  cantidad: 0,   unidad: 'unidades'   },
      { nombre: 'Sillas de ruedas',        categoria: 'Movilidad',     cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '3': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 180, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 120, unidad: 'kg'         },
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 8,   unidad: 'kits'       },
      { nombre: 'Calzado (tallas varias)', categoria: 'Calzado',       cantidad: 30,  unidad: 'pares'      },
    ],
    necesario: [
      { nombre: 'Generadores eléctricos',  categoria: 'Equipamiento',  cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '4': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 500, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 200, unidad: 'kg'         },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 90,  unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 60,  unidad: 'kits'       },
      { nombre: 'Mantas',                  categoria: 'Abrigo',        cantidad: 40,  unidad: 'unidades'   },
    ],
    necesario: [],
  },
  '5': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 95,  unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 30,  unidad: 'kg'         },
    ],
    necesario: [
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 0,   unidad: 'kits'       },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 0,   unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 0,   unidad: 'kits'       },
    ],
  },
}

const CATEGORIA_EMOJI: Record<string, string> = {
  Bebidas: '💧', Alimentación: '🍱', Abrigo: '🛏', Sanidad: '💊',
  Ropa: '🧥', Bebés: '👶', Equipamiento: '🔦', Higiene: '🧴',
  Herramientas: '🔧', Calzado: '👟', Movilidad: '♿',
}

type ProductoDisponible = ItemInventario & { puesto: PuestoMarker }
type ProductoOption = {
  nombre: string
  categoria: string
  unidad: string
  total: number
}

const ROUTE_SEARCH_TIMEOUT_MS = 90000


// ── Routing via OSRM (demo público) ──────────────────────────────────────────

export async function fetchRuta(
  desde: [number, number],
  hasta: [number, number],
  incidencias: IncidenciaMarker[] = [],
): Promise<{ points: [number, number][]; distanciaKm: number; duracionMin: number; incidenciasCercanas: number; incidenciasEvitadas: number }> {
  // OSRM espera longitud,latitud (orden inverso a Leaflet)
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${desde[1]},${desde[0]};${hasta[1]},${hasta[0]}` +
    `?overview=full&geometries=geojson&alternatives=true`
  const res = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error('No se encontró ruta disponible')
  // OSRM devuelve [lng, lat] → convertir a [lat, lng] para Leaflet
  const candidates = data.routes.map((route: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }) => {
    const points: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    )
    return {
      points,
      distanciaKm: route.distance / 1000,
      duracionMin: Math.round(route.duration / 60),
      incidenciasCercanas: countBlockedIncidenciasNearRoute(points, incidencias),
    }
  }).sort((a: { incidenciasCercanas: number; duracionMin: number }, b: { incidenciasCercanas: number; duracionMin: number }) => (
    a.incidenciasCercanas - b.incidenciasCercanas || a.duracionMin - b.duracionMin
  ))

  const best = candidates[0]
  if (!best) throw new Error('No se encontrÃ³ ruta disponible')
  return {
    ...best,
    incidenciasEvitadas: Math.max(0, candidates[candidates.length - 1].incidenciasCercanas - best.incidenciasCercanas),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RouteCandidate = {
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  incidenciasCercanas: number
}

async function fetchRouteCandidates(
  coordinates: [number, number][],
  incidencias: IncidenciaMarker[],
  signal?: AbortSignal,
): Promise<RouteCandidate[]> {
  const path = coordinates.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const url =
    `https://router.project-osrm.org/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&alternatives=true&continue_straight=false`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error('No se encontro ruta disponible')

  return data.routes.map((route: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }) => {
    const points: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    )
    return {
      points,
      distanciaKm: route.distance / 1000,
      duracionMin: Math.round(route.duration / 60),
      incidenciasCercanas: blockedIncidenciasNearRoute(points, incidencias).length,
    }
  })
}

function sortRouteCandidates(candidates: RouteCandidate[]) {
  return candidates.sort((a, b) => (
    a.incidenciasCercanas - b.incidenciasCercanas ||
    a.duracionMin - b.duracionMin ||
    a.distanciaKm - b.distanciaKm
  ))
}

function detourPointsAroundIncidencia(
  incidencia: IncidenciaMarker,
): [number, number][] {
  const mid: [number, number] = [incidencia.latitud, incidencia.longitud]
  const offset = 0.004

  return [
    [mid[0] + offset, mid[1]],
    [mid[0] - offset, mid[1]],
    [mid[0], mid[1] + offset],
    [mid[0], mid[1] - offset],
    [mid[0] + offset, mid[1] + offset],
    [mid[0] + offset, mid[1] - offset],
    [mid[0] - offset, mid[1] + offset],
    [mid[0] - offset, mid[1] - offset],
  ]
}

function buildDetourWaypointSets(
  desde: [number, number],
  hasta: [number, number],
  blocked: IncidenciaMarker[],
) {
  const waypointSets: [number, number][][] = []
  const detoursByBlock = blocked.slice(0, 4).map((inc) => detourPointsAroundIncidencia(inc))

  detoursByBlock.forEach((detours) => {
    detours.forEach((detour) => waypointSets.push([desde, detour, hasta]))
  })

  if (detoursByBlock.length > 1) {
    const combinations: [number, number][][] = [[]]
    detoursByBlock.forEach((detours) => {
      const next: [number, number][][] = []
      combinations.forEach((combo) => {
        detours.forEach((detour) => next.push([...combo, detour]))
      })
      combinations.splice(0, combinations.length, ...next)
    })

    combinations.forEach((combo) => waypointSets.push([desde, ...combo, hasta]))
  }

  return waypointSets
}

export async function fetchRutaEvitandoIncidencias(
  desde: [number, number],
  hasta: [number, number],
  incidencias: IncidenciaMarker[],
  signal?: AbortSignal,
) {
  const directCandidates = await fetchRouteCandidates([desde, hasta], incidencias, signal)
  const directBest = sortRouteCandidates([...directCandidates])[0]
  if (!directBest) throw new Error('No se encontro ruta disponible')

  const candidates: RouteCandidate[] = [...directCandidates]
  const requestedWaypointSets = new Set<string>()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Busqueda de ruta cancelada', 'AbortError')
    const best = sortRouteCandidates([...candidates])[0]
    if (!best) break
    if (best.incidenciasCercanas === 0) {
      return {
        ...best,
        incidenciasEvitadas: Math.max(0, directBest.incidenciasCercanas - best.incidenciasCercanas),
      }
    }

    const blocked = blockedIncidenciasNearRoute(best.points, incidencias)
    for (const waypointSet of buildDetourWaypointSets(desde, hasta, blocked)) {
      const key = waypointSet.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';')
      if (requestedWaypointSets.has(key)) continue
      requestedWaypointSets.add(key)

      try {
        candidates.push(...await fetchRouteCandidates(waypointSet, incidencias, signal))
      } catch {
        if (signal?.aborted) throw new DOMException('Busqueda de ruta cancelada', 'AbortError')
        // Probamos otros desvios si un waypoint cae en zona no enrutable.
      }
    }
  }

  throw new Error('No hay una ruta segura que evite todas las incidencias cortadas reportadas.')
}

function InventarioSheet({
  puesto,
  onClose,
}: {
  puesto: PuestoMarker
  onClose: () => void
}) {
  // Intentar cargar inventario real desde la API; si falla usar los datos locales de ejemplo
  const { data: apiInv, isLoading } = useQuery({
    queryKey: ['inventario-ciudadano', puesto.id],
    queryFn: () =>
      apiClient
        .get<{ inventario: Array<{ id: string; tipo: string; cantidad: number; producto: { nombre: string; categoria: string; unidad: string } }> }>(
          `/api/inventario/puesto/${puesto.id}`,
        )
        .then((r) => {
          const disponible = r.data.inventario
            .filter((i) => i.tipo === 'DISPONIBLE')
            .map((i) => ({ nombre: i.producto.nombre, categoria: i.producto.categoria, cantidad: i.cantidad, unidad: i.producto.unidad }))
          const necesario = r.data.inventario
            .filter((i) => i.tipo === 'NECESARIO')
            .map((i) => ({ nombre: i.producto.nombre, categoria: i.producto.categoria, cantidad: i.cantidad, unidad: i.producto.unidad }))
          return { disponible, necesario }
        }),
    staleTime: 1000 * 30,
    retry: false,
  })

  // Fallback a datos de ejemplo si la API falla o no tiene datos todavía
  const fallback = INVENTARIO[puesto.id] ?? { disponible: [], necesario: [] }
  const inv = apiInv ?? fallback

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[70vh]">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Cabecera */}
      <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Inventario</p>
          <p className="font-semibold text-gray-900">{puesto.nombre}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Contenido scrollable */}
      <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-5 pt-3">

        {isLoading && (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Disponible */}
        <section>
          <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Disponible ({inv.disponible.length})
          </h3>
          {inv.disponible.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin productos disponibles</p>
          ) : (
            <div className="space-y-1">
              {inv.disponible.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {item.cantidad} {item.unidad}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Necesario */}
        {inv.necesario.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Necesitamos ({inv.necesario.length})
            </h3>
            <div className="space-y-1">
              {inv.necesario.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <Badge variant="danger">Urgente</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────

function getProductosDisponibles(puestos: PuestoMarker[]) {
  return _getProductosDisponibles(puestos, INVENTARIO)
}

function getProductoOptions(disponibles: ProductoDisponible[]): ProductoOption[] {
  return _getProductoOptions(disponibles)
}

function BuscarProductoSheet({
  producto,
  textoBusqueda,
  productos,
  resultados,
  selectedPuesto,
  userPosition,
  routeLoading,
  routeError,
  onTextoBusquedaChange,
  onPreviewPuesto,
  onComoLlegar,
  onCancelRuta,
  onBackToResults,
  onClose,
}: {
  producto: string
  textoBusqueda: string
  productos: ProductoOption[]
  resultados: ProductoDisponible[]
  selectedPuesto: PuestoMarker | null
  userPosition: [number, number] | null
  routeLoading: boolean
  routeError: string | null
  onTextoBusquedaChange: (texto: string) => void
  onPreviewPuesto: (puestoId: string) => void
  onComoLlegar: (puestoId: string) => void
  onCancelRuta: () => void
  onBackToResults: () => void
  onClose: () => void
}) {
  const recomendado = resultados[0]
  const [inputFocused, setInputFocused] = useState(false)
  const inventarioSeleccionado = selectedPuesto
    ? INVENTARIO[selectedPuesto.id] ?? { disponible: [], necesario: [] }
    : null
  const showSugerencias = inputFocused
  const hasTextoBusqueda = textoBusqueda.trim().length > 0

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] flex max-h-[84vh] flex-col bg-white rounded-t-2xl shadow-2xl">
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Buscar producto</p>
          <p className="font-semibold text-gray-900">Disponibilidad por puesto</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          x
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-4">
        <div>
          <label htmlFor="texto-producto-busqueda" className="block text-sm font-medium text-gray-700 mb-1">
            Producto
          </label>
          <div>
            <input
              id="texto-producto-busqueda"
              type="search"
              value={textoBusqueda}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onChange={(e) => {
                onTextoBusquedaChange(e.target.value)
                onBackToResults()
              }}
              className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm bg-white"
              placeholder="Escribe o elige un producto"
              autoComplete="off"
            />

            {showSugerencias && productos.length > 0 && (
              <div className="mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {productos.map((item) => (
                  <button
                    key={item.nombre}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onTextoBusquedaChange(item.nombre)
                      onBackToResults()
                      setInputFocused(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${
                      item.nombre === producto ? 'bg-blue-50 text-blue-800' : 'text-gray-800'
                    }`}
                  >
                    <span className="font-medium">{item.nombre}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {item.total} {item.unidad}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {productos.length === 0 && hasTextoBusqueda && (
            <p className="text-xs text-gray-500 mt-1">No hay productos que coincidan con la busqueda.</p>
          )}
          {productos.length > 0 && producto && (
            <p className="text-xs text-gray-500 mt-1">
              Seleccionado: {producto}
            </p>
          )}
          {!producto && (
            <p className="text-xs text-gray-500 mt-1">Selecciona un producto para ver los puestos con stock.</p>
          )}
        </div>

        {!userPosition && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Comparte tu ubicacion para que la recomendacion use el puesto mas cercano.
          </p>
        )}

        {selectedPuesto && inventarioSeleccionado ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={onBackToResults}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Volver a puestos
            </button>

            <div className="border-2 border-blue-400 bg-blue-50 rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{selectedPuesto.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedPuesto.direccion}</p>
                </div>
                {selectedPuesto.distanciaKm !== undefined && (
                  <span className="text-xs font-medium text-blue-700 flex-shrink-0">{selectedPuesto.distanciaKm.toFixed(1)} km</span>
                )}
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="primary"
                  fullWidth
                  loading={routeLoading}
                  onClick={() => onComoLlegar(selectedPuesto.id)}
                >
                  🚗 Cómo llegar
                </Button>
                {routeLoading && (
                  <div className="mt-2 text-xs text-blue-800 bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-blue-700 border-t-transparent rounded-full flex-shrink-0" />
                      <span>Calculando ruta segura...</span>
                    </div>
                    <button
                      type="button"
                      onClick={onCancelRuta}
                      className="w-full rounded-md border border-blue-300 bg-white/70 px-2 py-1 font-medium text-blue-800 hover:bg-white"
                    >
                      Cancelar busqueda de ruta
                    </button>
                  </div>
                )}
                {routeError && (
                  <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {routeError}
                  </p>
                )}
              </div>
            </div>

            <section>
              <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Productos disponibles ({inventarioSeleccionado.disponible.length})
              </h3>
              {inventarioSeleccionado.disponible.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Sin productos disponibles</p>
              ) : (
                <div className="space-y-1">
                  {inventarioSeleccionado.disponible.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg flex-shrink-0">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
                          <p className="text-xs text-gray-400">{item.categoria}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-green-700 flex-shrink-0">
                        {item.cantidad} {item.unidad}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        ) : recomendado && (
          <button
            type="button"
            onClick={() => onPreviewPuesto(recomendado.puesto.id)}
            className="w-full text-left border-2 border-blue-400 bg-blue-50 rounded-xl p-3.5 transition-colors hover:bg-blue-100"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Recomendado</span>
              {recomendado.puesto.distanciaKm !== undefined && (
                <span className="text-xs font-medium text-blue-700">{recomendado.puesto.distanciaKm.toFixed(1)} km</span>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-sm">{recomendado.puesto.nombre}</p>
            <p className="text-xs text-gray-500 mt-0.5">{recomendado.puesto.direccion}</p>
            <p className="text-sm text-blue-800 mt-2">
              {CATEGORIA_EMOJI[recomendado.categoria] ?? '📦'} {recomendado.cantidad} {recomendado.unidad} disponibles
            </p>
          </button>
        )}

        {!selectedPuesto && (
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Otros puestos con stock
            </h3>
            <div className="space-y-2">
              {resultados.slice(1).map((item) => (
                <button
                  key={`${item.puesto.id}-${item.nombre}`}
                  type="button"
                  onClick={() => onPreviewPuesto(item.puesto.id)}
                  className="w-full text-left border border-gray-200 bg-white rounded-xl p-3 transition-colors hover:border-blue-200 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{item.puesto.nombre}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.puesto.direccion}</p>
                    </div>
                    {item.puesto.distanciaKm !== undefined && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{item.puesto.distanciaKm.toFixed(1)} km</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {item.cantidad} {item.unidad} disponibles
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type Vista = 'default' | 'ruta' | 'inventario' | 'reportar' | 'buscar'
type EstadoVia = 'CORTADA' | 'TRANSITABLE'

type DuplicateIncidencia = {
  id: string
  latitud: number
  longitud: number
  estado: EstadoVia
  descripcion: string | null
  createdAt: string
}

const CATASTROFE_ID = import.meta.env.VITE_CATASTROFE_ID ?? ''

export default function CiudadanoDashboard() {
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
  const [vista, setVista]             = useState<Vista>('default')
  const [route, setRoute]             = useState<[number, number][] | null>(null)
  const [routeInfo, setRouteInfo]     = useState<{
    distanciaKm: number
    duracionMin: number
    incidenciasCercanas: number
    incidenciasEvitadas: number
  } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError]   = useState<string | null>(null)
  const [reportDescripcion, setReportDescripcion] = useState('')
  const [reportPosition, setReportPosition] = useState<[number, number] | null>(null)
  const [isPickingLocation, setIsPickingLocation] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSuccess, setReportSuccess] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<DuplicateIncidencia | null>(null)
  const [incidencias, setIncidencias] = useState<IncidenciaMarker[]>([])
  const [incidenciasLoading, setIncidenciasLoading] = useState(false)
  const [incidenciasError, setIncidenciasError] = useState<string | null>(null)
  const [comentarioIncidencia, setComentarioIncidencia] = useState<IncidenciaMarker | null>(null)
  const [comentarioEstado, setComentarioEstado] = useState<EstadoVia>('CORTADA')
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [comentarioLoading, setComentarioLoading] = useState(false)
  const [comentarioError, setComentarioError] = useState<string | null>(null)
  const [historialComentariosIncidencia, setHistorialComentariosIncidencia] = useState<IncidenciaMarker | null>(null)
  const [productoBusqueda, setProductoBusqueda] = useState('')
  const [textoProductoBusqueda, setTextoProductoBusqueda] = useState('')
  const [busquedaPuestoId, setBusquedaPuestoId] = useState<string | null>(null)

  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()
  const enqueueSync = useSyncStore((s) => s.enqueue)
  const loadPendingSyncCount = useSyncStore((s) => s.loadPendingCount)
  const routeAbortControllerRef = useRef<AbortController | null>(null)
  const routeTimeoutRef = useRef<number | null>(null)
  const routeAbortReasonRef = useRef<'cancel' | 'timeout' | null>(null)
  const autoRouteTargetRef = useRef<string | null>(null)

  const destinoPuesto = useMemo<Omit<PuestoMarker, 'distanciaKm'> | null>(() => {
    const id = searchParams.get('destinoId')
    const latitud = Number(searchParams.get('lat'))
    const longitud = Number(searchParams.get('lng'))

    if (!id || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return null

    return {
      id,
      nombre: searchParams.get('nombre') ?? 'Destino',
      direccion: searchParams.get('direccion') ?? 'Destino seleccionado',
      latitud,
      longitud,
      necesidades: 0,
    }
  }, [searchParams])

  useEffect(() => {
    if (position) setUserPosition([position.lat, position.lng])
  }, [position])

  useEffect(() => {
    if (!feedbackMessage) return
    const timeout = setTimeout(() => setFeedbackMessage(null), 3000)
    return () => clearTimeout(timeout)
  }, [feedbackMessage])

  useEffect(() => {
    void loadPendingSyncCount()
  }, [loadPendingSyncCount])

  useEffect(() => () => {
    routeAbortControllerRef.current?.abort()
    if (routeTimeoutRef.current !== null) window.clearTimeout(routeTimeoutRef.current)
  }, [])

  const refreshIncidencias = useCallback(async () => {
    setIncidenciasLoading(true)
    setIncidenciasError(null)
    try {
      const params = CATASTROFE_ID ? { catastrofeId: CATASTROFE_ID } : undefined
      const { data } = await apiClient.get('/api/incidencias', { params })
      setIncidencias((prev) => {
        const pendientes = prev.filter((inc) => inc.pendingSync)
        return [...pendientes, ...(data.incidencias ?? [])]
      })
    } catch {
      setIncidenciasError('No se pudieron actualizar las incidencias. Se muestran las disponibles en este dispositivo.')
    } finally {
      setIncidenciasLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadIncidencias = async () => {
      try {
        const params = CATASTROFE_ID ? { catastrofeId: CATASTROFE_ID } : undefined
        const { data } = await apiClient.get('/api/incidencias', { params })
        setIncidencias(data.incidencias ?? [])
      } catch {
        // Si falla, mantenemos estado local vacío sin bloquear la UI.
      }
    }

    void loadIncidencias()
  }, [])

  // Limpiar ruta/inventario al cambiar de puesto
  const handleSelectPuesto = (id: string) => {
    if (id === selectedId) {
      setSelectedId(null)
      setVista('default')
      setRoute(null)
      setRouteInfo(null)
    } else {
      setSelectedId(id)
      setVista('default')
      setRoute(null)
      setRouteInfo(null)
      setRouteError(null)
    }
  }

  const calcularRutaPuesto = async (puesto: PuestoMarker) => {
    if (!userPosition) {
      setRouteError('Comparte tu ubicación primero para calcular la ruta')
      return
    }

    routeAbortControllerRef.current?.abort()
    if (routeTimeoutRef.current !== null) window.clearTimeout(routeTimeoutRef.current)

    const controller = new AbortController()
    routeAbortControllerRef.current = controller
    routeAbortReasonRef.current = null
    routeTimeoutRef.current = window.setTimeout(() => {
      routeAbortReasonRef.current = 'timeout'
      controller.abort()
    }, ROUTE_SEARCH_TIMEOUT_MS)

    setRouteLoading(true)
    setRouteError(null)
    try {
      const resultado = await fetchRutaSegura(userPosition, [puesto.latitud, puesto.longitud], incidencias, controller.signal)
      setRoute(resultado.points)
      setRouteInfo({
        distanciaKm: resultado.distanciaKm,
        duracionMin: resultado.duracionMin,
        incidenciasCercanas: resultado.incidenciasCercanas,
        incidenciasEvitadas: resultado.incidenciasEvitadas,
      })
      setVista('ruta')
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      if (aborted && routeAbortReasonRef.current === 'cancel') {
        setRouteError('Busqueda de ruta cancelada.')
      } else if (aborted && routeAbortReasonRef.current === 'timeout') {
        setRouteError('La busqueda de ruta ha tardado demasiado. Intentalo de nuevo.')
      } else {
        setRouteError(e instanceof Error ? e.message : 'No se pudo calcular la ruta')
      }
    } finally {
      if (routeAbortControllerRef.current === controller) routeAbortControllerRef.current = null
      if (routeTimeoutRef.current !== null) {
        window.clearTimeout(routeTimeoutRef.current)
        routeTimeoutRef.current = null
      }
      routeAbortReasonRef.current = null
      setRouteLoading(false)
    }
  }

  const handleCancelarBusquedaRuta = () => {
    routeAbortReasonRef.current = 'cancel'
    routeAbortControllerRef.current?.abort()
  }

  const handleComoLlegar = async () => {
    const puesto = puestos.find((p) => p.id === selectedId)
    if (!puesto) return

    await calcularRutaPuesto(puesto)
  }

  const handleCancelarRuta = () => {
    setRoute(null)
    setRouteInfo(null)
    setVista('default')
    setRouteError(null)
  }

  const submitIncidencia = async (force: boolean) => {
    if (!reportPosition) {
      setReportError('Selecciona un punto en el mapa para reportar la incidencia.')
      return
    }

    const body = {
      catastrofeId: CATASTROFE_ID || undefined,
      latitud: reportPosition[0],
      longitud: reportPosition[1],
      estado: 'CORTADA' as const,
      descripcion: reportDescripcion.trim() || undefined,
      force,
    }

    const queueOfflineReport = async () => {
      await enqueueSync({
        entity: 'incidencia-via',
        method: 'POST',
        url: '/api/incidencias',
        body,
        priority: 'high',
      })

      const pendingIncidencia: IncidenciaMarker = {
        id: `offline-${crypto.randomUUID()}`,
        latitud: body.latitud,
        longitud: body.longitud,
        estado: body.estado,
        descripcion: body.descripcion ?? null,
        createdAt: new Date().toISOString(),
        pendingSync: true,
      }

      setIncidencias((prev) => [pendingIncidencia, ...prev])
      setReportSuccess('Reporte guardado offline. Se enviara cuando vuelva la conexion.')
      setPendingDuplicate(null)
      setReportDescripcion('')
      setReportPosition(null)
      setIsPickingLocation(false)
      setVista('default')
      setFeedbackMessage('Reporte guardado offline y pendiente de sincronizar.')
    }

    setReportLoading(true)
    setReportError(null)
    setReportSuccess(null)

    try {
      if (!navigator.onLine) {
        await queueOfflineReport()
        return
      }

      const { data } = await apiClient.post('/api/incidencias', body)
      if (data?.incidencia) {
        setIncidencias((prev) => [data.incidencia, ...prev])
      }
      setReportSuccess('Incidencia enviada correctamente.')
      setPendingDuplicate(null)
      setReportDescripcion('')
      setReportPosition(null)
      setIsPickingLocation(false)
      setVista('default')
      setFeedbackMessage('Incidencia creada correctamente.')
    } catch (error: unknown) {
      const response = (error as {
        response?: {
          status?: number
          data?: { error?: string; message?: string; code?: string; duplicateIncidencia?: DuplicateIncidencia }
        }
      })?.response
      if (response?.status === 409 && response.data?.code === 'INCIDENCIA_DUPLICADA_CERCANA') {
        setPendingDuplicate(response.data.duplicateIncidencia ?? null)
        setReportError('Ya existe una incidencia muy cerca. Puedes confirmarla o enviarla de todas formas.')
      } else if (!response) {
        await queueOfflineReport()
      } else {
        setPendingDuplicate(null)
        const apiError = response?.data?.error ?? response?.data?.message
        setReportError(apiError ?? 'No se pudo enviar el reporte. Inténtalo de nuevo.')
      }
    } finally {
      setReportLoading(false)
    }
  }

  const handleReportarCalle = async () => {
    await submitIncidencia(false)
  }

  const handleConfirmarDuplicada = async () => {
    await submitIncidencia(true)
  }

  const abrirReporte = (position: [number, number] | null = null) => {
    setVista('reportar')
    setReportDescripcion('')
    setReportError(null)
    setReportSuccess(null)
    setPendingDuplicate(null)
    setReportPosition(position)
    setIsPickingLocation(!position)
  }

  const abrirBusquedaProducto = () => {
    setProductoBusqueda('')
    setTextoProductoBusqueda('')
    setBusquedaPuestoId(null)
    setVista('buscar')
  }

  const handleTextoProductoBusqueda = (texto: string) => {
    setTextoProductoBusqueda(texto)
    setBusquedaPuestoId(null)

    const normalizado = texto.trim().toLocaleLowerCase('es')
    if (!normalizado) {
      setProductoBusqueda('')
      return
    }

    const match = productoOptions.find((item) => (
      item.nombre.toLocaleLowerCase('es') === normalizado
    ))
    setProductoBusqueda(match?.nombre ?? '')
  }

  const handlePreviewPuestoBusqueda = (puestoId: string) => {
    setSelectedId(puestoId)
    setBusquedaPuestoId(puestoId)
    setRoute(null)
    setRouteInfo(null)
    setRouteError(null)
  }

  const handleComoLlegarBusqueda = async (puestoId: string) => {
    const puesto = puestos.find((p) => p.id === puestoId)
    if (!puesto) return

    setSelectedId(puestoId)
    await calcularRutaPuesto(puesto)
  }

  const abrirComentarioIncidencia = (
    incidencia: IncidenciaMarker,
    estado: EstadoVia,
    comentario = '',
  ) => {
    setComentarioIncidencia(incidencia)
    setComentarioEstado(estado)
    setComentarioTexto(comentario)
    setComentarioError(null)
  }

  const handleIncidenciaAction = (incidencia: IncidenciaMarker, action: IncidenciaAction) => {
    if (action !== 'comentar') return

    abrirComentarioIncidencia(
      incidencia,
      incidencia.estado,
      '',
    )
  }

  const handleSubmitComentarioIncidencia = async () => {
    if (!comentarioIncidencia) return

    const comentario = comentarioTexto.trim()
    if (!comentario) {
      setComentarioError('Escribe un comentario para guardar la actualizacion.')
      return
    }

    setComentarioLoading(true)
    setComentarioError(null)

    try {
      const { data } = await apiClient.post(`/api/incidencias/${comentarioIncidencia.id}/comentarios`, {
        estado: comentarioEstado,
        comentario,
      })

      if (data?.comentario) {
        const nuevoEstado = data.incidencia?.estado ?? comentarioEstado
        setIncidencias((prev) => prev.map((inc) => {
          if (inc.id !== comentarioIncidencia.id) return inc
          return {
            ...inc,
            estado: nuevoEstado,
            comentarios: [data.comentario, ...(inc.comentarios ?? [])].slice(0, 3),
            _count: {
              ...inc._count,
              comentarios: (inc._count?.comentarios ?? 0) + 1,
            },
          }
        }))
        setHistorialComentariosIncidencia((prev) => {
          if (!prev || prev.id !== comentarioIncidencia.id) return prev
          return {
            ...prev,
            estado: nuevoEstado,
            comentarios: [data.comentario, ...(prev.comentarios ?? [])],
            _count: {
              ...prev._count,
              comentarios: (prev._count?.comentarios ?? 0) + 1,
            },
          }
        })
      }

      setComentarioIncidencia(null)
      setComentarioTexto('')
      setFeedbackMessage(
        comentarioEstado === 'TRANSITABLE'
          ? 'Incidencia marcada como resuelta.'
          : 'Comentario añadido a la incidencia.',
      )
    } catch (error: unknown) {
      const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response
      setComentarioError(response?.data?.error ?? response?.data?.message ?? 'No se pudo guardar el comentario.')
    } finally {
      setComentarioLoading(false)
    }
  }

  const { data: puestosApiData, isLoading: loadingPuestos } = useQuery({
    queryKey: ['puestos-ciudadano'],
    queryFn: () =>
      apiClient
        .get<{ puestos: Omit<PuestoMarker, 'distanciaKm'>[] }>('/api/puestos')
        .then((r) => r.data.puestos),
    staleTime: 1000 * 30,
    retry: false,     // no reintentar en offline
    placeholderData: [], // evitar parpadeo mientras carga
  })

  const puestosBase = destinoPuesto
    ? [destinoPuesto, ...(puestosApiData ?? []).filter((puesto) => puesto.id !== destinoPuesto.id)]
    : puestosApiData ?? []

  const puestos: PuestoMarker[] = userPosition
    ? sortByDistance(puestosBase, userPosition[0], userPosition[1])
    : puestosBase.map((p) => ({ ...p }))

  const productosDisponibles = getProductosDisponibles(puestos)
  const productoOptions = getProductoOptions(productosDisponibles)
  const textoProductoNormalizado = textoProductoBusqueda.trim().toLocaleLowerCase('es')
  const productoOptionsFiltradas = textoProductoNormalizado
    ? productoOptions.filter((item) => (
      item.nombre.toLocaleLowerCase('es').includes(textoProductoNormalizado) ||
      item.categoria.toLocaleLowerCase('es').includes(textoProductoNormalizado)
    ))
    : productoOptions
  const productoSeleccionado = productoOptions.some((item) => item.nombre === productoBusqueda)
    ? productoBusqueda
    : ''
  const resultadosProducto = productosDisponibles.filter((item) => item.nombre === productoSeleccionado)
  const selectedPuesto = selectedId ? puestos.find((p) => p.id === selectedId) ?? null : null
  const selectedPuestoBusqueda = busquedaPuestoId ? puestos.find((p) => p.id === busquedaPuestoId) ?? null : null
  const totalCortadas = incidencias.filter((inc) => inc.estado === 'CORTADA').length
  const totalTransitables = incidencias.filter((inc) => inc.estado === 'TRANSITABLE').length
  const totalPendientes = incidencias.filter((inc) => inc.pendingSync).length

  useEffect(() => {
    if (!destinoPuesto || !userPosition || routeLoading) return
    if (autoRouteTargetRef.current === destinoPuesto.id) return

    const puesto = puestos.find((item) => item.id === destinoPuesto.id)
    if (!puesto) return

    autoRouteTargetRef.current = destinoPuesto.id
    setSelectedId(puesto.id)
    void calcularRutaPuesto(puesto)
  }, [destinoPuesto, puestos, routeLoading, userPosition])

  return (
    <div className="flex flex-col h-full">

      {/* Banner catástrofe */}
      <div className="bg-red-600 text-white px-4 py-2 flex-shrink-0">
        <p className="text-xs font-medium uppercase tracking-wide">Catástrofe activa</p>
        <p className="font-semibold text-sm">DANA Valencia — Fase: Limpieza</p>
      </div>

      {/* Banner de ruta activa */}
      {vista === 'ruta' && routeInfo && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm">
            🚗 <strong>{routeInfo.distanciaKm.toFixed(1)} km</strong>
            {' · ~'}<strong>{routeInfo.duracionMin} min</strong>
            {selectedPuesto && ` · ${selectedPuesto.nombre}`}
            {routeInfo.incidenciasEvitadas > 0 && ` · evita ${routeInfo.incidenciasEvitadas} corte${routeInfo.incidenciasEvitadas === 1 ? '' : 's'}`}
            {routeInfo.incidenciasCercanas > 0 && ` · ${routeInfo.incidenciasCercanas} corte${routeInfo.incidenciasCercanas === 1 ? '' : 's'} cerca`}
          </span>
          <button
            onClick={handleCancelarRuta}
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {feedbackMessage && (
        <div className="px-4 pt-2 flex-shrink-0">
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">
            {feedbackMessage}
          </div>
        </div>
      )}

      {/* Mapa */}
      <div
        className={`relative ${vista === 'buscar' ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}
        style={vista === 'buscar' ? undefined : { height: '50vh' }}
      >
        <Map
          center={[39.4250, -0.4000]}
          zoom={13}
          userPosition={userPosition}
          reportPoint={reportPosition}
          selectingReportPoint={vista === 'reportar'}
          puestos={puestos}
          incidencias={incidencias}
          selectedPuestoId={selectedId}
          onPuestoSelect={handleSelectPuesto}
          onUserLocated={setUserPosition}
          onReportPointSelect={(pos) => {
            setReportPosition(pos)
            setIsPickingLocation(false)
            setReportError(null)
            setReportSuccess(null)
          }}
          onIncidenciaAction={handleIncidenciaAction}
          onIncidenciaCommentsOpen={setHistorialComentariosIncidencia}
          route={route}
          markerVariant="neutral"
          className="h-full w-full"
        />

        {vista === 'reportar' && (
          <div className="absolute top-3 left-3 right-20 z-[1000] bg-red-600/90 text-white rounded-xl px-3 py-2 text-xs shadow-lg">
            {isPickingLocation
              ? 'Toca el mapa para marcar la calle de la incidencia.'
              : 'Punto marcado. Puedes cambiarlo pulsando "Cambiar punto".'}
          </div>
        )}

        {routeLoading && (
          <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 px-4 py-3 flex items-center gap-3 max-w-[280px]">
              <span className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Calculando ruta segura</p>
                <p className="text-xs text-gray-500 mt-0.5">Evitando calles con incidencias reportadas...</p>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-md border border-gray-200 px-3 py-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Incidencias</p>
            <button
              type="button"
              onClick={() => void refreshIncidencias()}
              disabled={incidenciasLoading}
              className="text-[11px] font-medium text-blue-700 disabled:text-gray-400"
            >
              {incidenciasLoading ? '...' : 'Actualizar'}
            </button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              {totalCortadas} cortada{totalCortadas === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
              {totalTransitables} resuelta{totalTransitables === 1 ? '' : 's'}
            </span>
          </div>
          {totalPendientes > 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              {totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'} de sincronizar
            </p>
          )}
          {incidenciasError && (
            <p className="text-[11px] text-amber-700 mt-1 max-w-56">{incidenciasError}</p>
          )}
        </div>

        {/* Botón localizarme */}
        <button
          onClick={requestGeo}
          disabled={geoLoading}
          className="absolute top-3 right-12 z-[1000] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {geoLoading ? '🔄 Localizando…' : '📍 Localizarme'}
        </button>

      </div>

      {/* Acciones rápidas */}
      <div className={`px-4 py-2.5 grid-cols-2 gap-2 border-b border-gray-100 bg-white flex-shrink-0 ${vista === 'buscar' ? 'hidden' : 'grid'}`}>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => abrirReporte()}
        >
          📍 Reportar calle
        </Button>
        <Button variant="secondary" size="sm" fullWidth onClick={abrirBusquedaProducto}>
          🔍 Buscar producto
        </Button>
      </div>

      {/* Lista de puestos */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${vista === 'buscar' ? 'hidden' : ''}`}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            Puestos de emergencia
            {loadingPuestos
              ? <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500 inline-block" />
              : <span className="font-normal text-gray-400">({puestos.length})</span>
            }
          </h2>
          {userPosition && <span className="text-xs text-blue-600">Por distancia</span>}
        </div>

        <div className="px-4 pb-6 space-y-2">
          {puestos.map((puesto) => {
            const isSelected = puesto.id === selectedId

            return (
              <div key={puesto.id}>
                <button
                  onClick={() => handleSelectPuesto(puesto.id)}
                  className={`w-full text-left rounded-xl p-3.5 border-2 transition-all ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white shadow-sm flex items-center justify-center text-base flex-shrink-0">
                      🏪
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate">{puesto.nombre}</p>
                        {puesto.distanciaKm !== undefined && (
                          <span className="text-xs text-gray-400 flex-shrink-0">{puesto.distanciaKm.toFixed(1)} km</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{puesto.direccion}</p>
                    </div>
                  </div>

                  {/* Acciones del puesto seleccionado */}
                  {isSelected && (
                    <div
                      className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-2 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="primary"
                        fullWidth
                        onClick={() => setVista('inventario')}
                      >
                        📦 Ver inventario
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        fullWidth
                        loading={routeLoading}
                        onClick={handleComoLlegar}
                      >
                        {vista === 'ruta' ? '🗺 Ver ruta' : '🚗 Cómo llegar'}
                      </Button>
                    </div>
                  )}

                  {isSelected && routeLoading && (
                    <div
                      className="mt-2 text-xs text-blue-800 bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-blue-700 border-t-transparent rounded-full flex-shrink-0" />
                        <span>Calculando ruta segura...</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelarBusquedaRuta}
                        className="w-full rounded-md border border-blue-300 bg-white/70 px-2 py-1 font-medium text-blue-800 hover:bg-white"
                      >
                        Cancelar busqueda de ruta
                      </button>
                    </div>
                  )}

                  {/* Error de ruta */}
                  {isSelected && routeError && (
                    <p
                      className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {routeError}
                    </p>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Panel de inventario (bottom sheet) */}
      {vista === 'inventario' && selectedPuesto && (
        <InventarioSheet puesto={selectedPuesto} onClose={() => setVista('default')} />
      )}

      {vista === 'buscar' && (
        <BuscarProductoSheet
          producto={productoSeleccionado}
          textoBusqueda={textoProductoBusqueda}
          productos={productoOptionsFiltradas}
          resultados={resultadosProducto}
          selectedPuesto={selectedPuestoBusqueda}
          userPosition={userPosition}
          routeLoading={routeLoading}
          routeError={routeError}
          onTextoBusquedaChange={handleTextoProductoBusqueda}
          onPreviewPuesto={handlePreviewPuestoBusqueda}
          onComoLlegar={(puestoId) => void handleComoLlegarBusqueda(puestoId)}
          onCancelRuta={handleCancelarBusquedaRuta}
          onBackToResults={() => setBusquedaPuestoId(null)}
          onClose={() => setVista('default')}
        />
      )}

      {historialComentariosIncidencia && (
        <div className="fixed inset-x-0 bottom-0 z-[2100] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[72vh]">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Historial</p>
              <p className="font-semibold text-gray-900">Comentarios de la incidencia</p>
            </div>
            <button
              onClick={() => setHistorialComentariosIncidencia(null)}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-3">
            {(historialComentariosIncidencia.comentarios ?? []).length === 0 ? (
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3">
                Todavia no hay comentarios en esta incidencia.
              </p>
            ) : (
              historialComentariosIncidencia.comentarios?.map((comentario) => (
                <article key={comentario.id} className="border border-gray-200 rounded-xl p-3 bg-white">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                      comentario.estado === 'CORTADA'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                    }`}
                    >
                      {comentario.estado === 'CORTADA' ? 'Sigue cortada' : 'Resuelta'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(comentario.createdAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{comentario.comentario}</p>
                  {comentario.autor && (
                    <p className="text-xs text-gray-500 mt-2">
                      {comentario.autor.nombre} {comentario.autor.apellidos}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {comentarioIncidencia && (
        <div className="fixed inset-x-0 bottom-0 z-[2100] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[70vh]">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Actualizar incidencia</p>
              <p className="font-semibold text-gray-900">Comentario o resolución</p>
            </div>
            <button
              onClick={() => {
                setComentarioIncidencia(null)
                setComentarioTexto('')
                setComentarioError(null)
              }}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            >
              ×
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Actualización</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setComentarioEstado('CORTADA')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    comentarioEstado === 'CORTADA'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">Sigue cortada</p>
                  <p className="text-xs mt-1">La incidencia continúa</p>
                </button>
                <button
                  type="button"
                  onClick={() => setComentarioEstado('TRANSITABLE')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    comentarioEstado === 'TRANSITABLE'
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">Resuelta</p>
                  <p className="text-xs mt-1">La calle ya es transitable</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comentario</label>
              <textarea
                rows={3}
                value={comentarioTexto}
                onChange={(e) => setComentarioTexto(e.target.value)}
                className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm bg-white"
                placeholder="Ejemplo: Han retirado los escombros y ya pasan coches"
              />
            </div>

            {comentarioError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {comentarioError}
              </p>
            )}

            <Button fullWidth loading={comentarioLoading} onClick={handleSubmitComentarioIncidencia} className="h-11">
              Guardar actualización
            </Button>
          </div>
        </div>
      )}

      {/* Panel de reporte de calles */}
      {vista === 'reportar' && (
        <div className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[70vh]">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Nueva incidencia</p>
              <p className="font-semibold text-gray-900">Reportar calle cortada</p>
            </div>
            <button
              onClick={() => {
                setVista('default')
                setIsPickingLocation(false)
                setReportError(null)
                setReportSuccess(null)
                setPendingDuplicate(null)
                setReportPosition(null)
              }}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-4">
            {isPickingLocation ? (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Seleccionar ubicación</p>
                  <p className="text-sm text-slate-700">
                    Toca directamente sobre el mapa para colocar el punto exacto de la incidencia.
                  </p>
                </div>

                {userPosition && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setReportPosition(userPosition)
                      setIsPickingLocation(false)
                      setReportError(null)
                    }}
                  >
                    Usar mi ubicación actual
                  </Button>
                )}
              </div>
            ) : (
              <>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Paso 1 · Ubicación</p>
              {reportPosition ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">Punto seleccionado correctamente.</p>
                  <p className="text-xs text-slate-500">
                    {reportPosition[0].toFixed(5)}, {reportPosition[1].toFixed(5)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Toca el mapa para elegir la calle exacta.
                </p>
              )}

              {userPosition && (
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setIsPickingLocation(true)
                      setReportError(null)
                    }}
                  >
                    Cambiar punto en el mapa
                  </Button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Información del problema (opcional)</label>
              <textarea
                rows={3}
                value={reportDescripcion}
                onChange={(e) => setReportDescripcion(e.target.value)}
                className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm bg-white"
                placeholder="Ejemplo: Hay agua acumulada y coches bloqueando el paso"
              />
            </div>

            {reportError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {reportError}
              </p>
            )}

            {pendingDuplicate && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                <p className="text-amber-800 font-medium">Incidencia cercana detectada</p>
                <p className="text-amber-700">
                  Estado: {pendingDuplicate.estado} · {new Date(pendingDuplicate.createdAt).toLocaleString('es-ES')}
                </p>
                {pendingDuplicate.descripcion && (
                  <p className="text-amber-700">{pendingDuplicate.descripcion}</p>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  loading={reportLoading}
                  onClick={handleConfirmarDuplicada}
                >
                  Enviar de todas formas
                </Button>
              </div>
            )}

            {reportSuccess && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {reportSuccess}
              </p>
            )}

            <Button fullWidth loading={reportLoading} onClick={handleReportarCalle} className="h-11">
              Enviar reporte
            </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
