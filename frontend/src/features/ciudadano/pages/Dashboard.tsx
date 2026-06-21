import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Map, { type IncidenciaAction, type IncidenciaMarker, type PuestoMarker } from '@/components/shared/Map'
import Button from '@/components/ui/Button'
import { useGeolocation } from '@/hooks/useGeolocation'
import { sortByDistance } from '@/utils/haversine'
import {
  countBlockedIncidenciasNearRoute,
  blockedIncidenciasNearRoute,
} from '@/utils/routing'
import {
  getInventarioNeto,
  getProductosDisponibles as _getProductosDisponibles,
  getProductoOptions as _getProductoOptions,
  getProductosRecomendados as _getProductosRecomendados,
  calcularOpcionesRutaProductos,
  type OpcionRutaProductos,
} from '@/utils/productos'
import { apiClient } from '@/lib/api/client'
import { readPublicSnapshot, savePublicSnapshot } from '@/lib/db/publicSnapshots'
import { useSyncStore } from '@/store/sync.store'
import { fetchRutaEvitandoIncidencias as fetchRutaSegura, fetchRutaMultiParada, fetchRutaConPasos, type ModoTransporte } from '@/utils/routing'
import {
  parsearStepsOsrm,
  formatearDistanciaNav,
  distanciaAlStep,
  distanciaAPolilinea,
  pasoAlcanzadoPorPosicion,
  type StepNavegacion,
} from '@/utils/navegacion'
import CiudadanoInicio from '../components/CiudadanoInicio'
import { ActualizarIncidenciaSheet, HistorialComentariosSheet } from '../components/IncidenciaComentarioSheets'
import InventarioSheet from '../components/InventarioSheet'
import PanelNavegacionActiva from '../components/PanelNavegacionActiva'
import {
  OpcionesRutaProductosPanel,
  SelectorProductosSheet,
  formatearTiempo,
  type ProductoOption,
} from '../components/ProductoPanels'

// PUESTOS_BASE ya no se usa — los puestos vienen de la API (/api/puestos)

type ItemInventario = { nombre: string; categoria: string; cantidad: number; unidad: string }
// Re-export alias para compatibilidad con el resto del fichero

type CategoriaIncidenciaKey = 'inundacion' | 'obstaculos_via' | 'limpieza' | 'asistencia'

const CATEGORIAS_INCIDENCIA: Array<{
  value: CategoriaIncidenciaKey
  label: string
  equipment: string[]
}> = [
  {
    value: 'inundacion',
    label: 'Agua o inundacion',
    equipment: ['Cubo', 'Guantes impermeables', 'Botas de agua', 'Chaleco reflectante'],
  },
  {
    value: 'obstaculos_via',
    label: 'Calle bloqueada',
    equipment: ['Guantes', 'Palanca o herramienta de carga', 'Carretilla', 'Chaleco reflectante'],
  },
  {
    value: 'limpieza',
    label: 'Escombros o limpieza',
    equipment: ['Guantes', 'Mascarilla', 'Escoba o pala', 'Bolsas resistentes'],
  },
  {
    value: 'asistencia',
    label: 'Ayuda a personas',
    equipment: ['Botiquín básico', 'Agua', 'Manta térmica', 'Teléfono con batería'],
  },
]

type ProductoDisponible = ItemInventario & { puesto: PuestoMarker }
type RadioBusquedaProductos = 2 | 5 | 10 | 'todos'

type InventarioPorPuesto = Record<string, { disponible: ItemInventario[]; necesario: ItemInventario[] }>
type ReverseGeocodeResponse = {
  display_name?: string
  address?: Record<string, string | undefined>
}

type ApiInventarioItem = {
  id: string
  tipo: 'DISPONIBLE' | 'NECESARIO' | 'disponible' | 'necesario'
  cantidad: number
  producto: {
    nombre: string
    categoria: string
    unidad: string
  }
}

const ROUTE_SEARCH_TIMEOUT_MS = 90000


// ── Routing via OSRM (servicio público) ──────────────────────────────────────

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
  if (!best) throw new Error('No se encontró ruta disponible')
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
  if (data.code !== 'Ok') throw new Error('No se encontró ruta disponible')

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
  if (!directBest) throw new Error('No se encontró ruta disponible')

  const candidates: RouteCandidate[] = [...directCandidates]
  const requestedWaypointSets = new Set<string>()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Búsqueda de ruta cancelada', 'AbortError')
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
        if (signal?.aborted) throw new DOMException('Búsqueda de ruta cancelada', 'AbortError')
        // Probamos otros desvios si un waypoint cae en zona no enrutable.
      }
    }
  }

  throw new Error('No hay una ruta segura que evite todas las incidencias cortadas reportadas.')
}

function normalizeApiInventario(items: ApiInventarioItem[]) {
  const raw = items.reduce<{ disponible: ItemInventario[]; necesario: ItemInventario[] }>((acc, item) => {
    const normalized = {
      nombre: item.producto.nombre,
      categoria: item.producto.categoria,
      cantidad: item.cantidad,
      unidad: item.producto.unidad,
    }

    if (item.tipo === 'DISPONIBLE' || item.tipo === 'disponible') {
      acc.disponible.push(normalized)
    } else if (item.tipo === 'NECESARIO' || item.tipo === 'necesario') {
      acc.necesario.push(normalized)
    }

    return acc
  }, { disponible: [], necesario: [] })

  return getInventarioNeto(raw)
}

function getProductosDisponibles(puestos: PuestoMarker[], inventario: InventarioPorPuesto) {
  return _getProductosDisponibles(puestos, inventario)
}

function getProductoOptions(disponibles: ProductoDisponible[]): ProductoOption[] {
  return _getProductoOptions(disponibles)
}

type Vista = 'inicio' | 'default' | 'ruta' | 'inventario' | 'reportar' | 'buscar' | 'ruta-productos' | 'navegacion'
type PanelReturnVista = 'inicio' | 'default'
type EstadoVia = 'CORTADA' | 'TRANSITABLE'
type DestinoNavegacion = { id: string; nombre: string; latitud: number; longitud: number }

type DuplicateIncidencia = {
  id: string
  latitud: number
  longitud: number
  estado: EstadoVia
  descripcion: string | null
  createdAt: string
}

// ── Arrow SVG used in the navigation compass ─────────────────────────────────
export default function CiudadanoDashboard() {
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
  const [vista, setVista]             = useState<Vista>(() => (searchParams.has('destinoId') ? 'default' : 'inicio'))
  const [panelReturnVista, setPanelReturnVista] = useState<PanelReturnVista>('inicio')
  const [route, setRoute]             = useState<[number, number][] | null>(null)
  const [routeInfo, setRouteInfo]     = useState<{
    distanciaKm: number
    duracionMin: number
    incidenciasCercanas: number
    incidenciasEvitadas: number
  } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError]   = useState<string | null>(null)
  const [reportTitulo, setReportTitulo] = useState('')
  const [reportCategoria, setReportCategoria] = useState<CategoriaIncidenciaKey>('obstaculos_via')
  const [reportDescripcion, setReportDescripcion] = useState('')
  const [reportPosition, setReportPosition] = useState<[number, number] | null>(null)
  const [reportAddress, setReportAddress] = useState<string | null>(null)
  const [reportAddressLoading, setReportAddressLoading] = useState(false)
  const [isPickingLocation, setIsPickingLocation] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSuccess, setReportSuccess] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<DuplicateIncidencia | null>(null)
  const [incidencias, setIncidencias] = useState<IncidenciaMarker[]>([])
  const [realtimeRefresh, setRealtimeRefresh] = useState(0)
  const [comentarioIncidencia, setComentarioIncidencia] = useState<IncidenciaMarker | null>(null)
  const [comentarioEstado, setComentarioEstado] = useState<EstadoVia>('CORTADA')
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [comentarioLoading, setComentarioLoading] = useState(false)
  const [comentarioError, setComentarioError] = useState<string | null>(null)
  const [historialComentariosIncidencia, setHistorialComentariosIncidencia] = useState<IncidenciaMarker | null>(null)
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([])
  const [textoBusquedaProducto, setTextoBusquedaProducto] = useState('')
  const [radioBusquedaProductos, setRadioBusquedaProductos] = useState<RadioBusquedaProductos>('todos')
  const [opcionesRutaProductos, setOpcionesRutaProductos] = useState<OpcionRutaProductos<PuestoMarker>[] | null>(null)
  const [opcionRutaIdx, setOpcionRutaIdx] = useState(0)
  const [modoTransporte, setModoTransporte] = useState<ModoTransporte>('driving')
  const [rutaProductosPoints, setRutaProductosPoints] = useState<[number, number][] | null>(null)
  const [rutaProductosInfo, setRutaProductosInfo] = useState<{ distanciaKm: number; duracionMin: number; incidenciasCercanas: number } | null>(null)
  const [rutaProductosLoading, setRutaProductosLoading] = useState(false)
  const [rutaProductosError, setRutaProductosError] = useState<string | null>(null)
  const [stepsNavegacion, setStepsNavegacion] = useState<StepNavegacion[]>([])
  const [stepActualIdx, setStepActualIdx] = useState(0)
  const [navLoading, setNavLoading] = useState(false)
  const [recalculandoRuta, setRecalculandoRuta] = useState(false)
  const [navError, setNavError] = useState<string | null>(null)
  const [destinoNavegacion, setDestinoNavegacion] = useState<DestinoNavegacion | null>(null)
  const [vozActiva, setVozActiva] = useState(true)
  const [headingDispositivo, setHeadingDispositivo] = useState<number | null>(null)
  const anunciosRef = useRef<Set<string>>(new Set())
  const muestrasFueraRutaRef = useRef(0)
  const ultimaMuestraPosicionRef = useRef('')
  const ultimoRecalculoRef = useRef(0)
  const [focusUserPositionKey, setFocusUserPositionKey] = useState(0)
  const [pendingUserPositionFocus, setPendingUserPositionFocus] = useState(false)

  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()
  const enqueueSync = useSyncStore((s) => s.enqueue)
  const loadPendingSyncCount = useSyncStore((s) => s.loadPendingCount)
  const routeAbortControllerRef = useRef<AbortController | null>(null)
  const routeTimeoutRef = useRef<number | null>(null)
  const routeAbortReasonRef = useRef<'cancel' | 'timeout' | null>(null)
  const autoRouteTargetRef = useRef<string | null>(null)
  const didFocusInitialUserPositionRef = useRef(false)

  const currentUserPosition = useMemo<[number, number] | null>(() => {
    const nextPosition: [number, number] | null = position ? [position.lat, position.lng] : userPosition
    return nextPosition && Number.isFinite(nextPosition[0]) && Number.isFinite(nextPosition[1])
      ? nextPosition
      : null
  }, [position, userPosition])
  const selectedReportCategory = useMemo(() => (
    CATEGORIAS_INCIDENCIA.find((categoria) => categoria.value === reportCategoria) ?? CATEGORIAS_INCIDENCIA[1]
  ), [reportCategoria])
  const reportLocationLabel = useMemo(() => {
    if (!reportPosition) return 'Sin ubicación marcada'
    if (reportAddressLoading) return 'Buscando dirección...'
    return reportAddress ?? `${reportPosition[0].toFixed(5)}, ${reportPosition[1].toFixed(5)}`
  }, [reportAddress, reportAddressLoading, reportPosition])

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
    if (destinoPuesto && vista === 'inicio') {
      setVista('default')
    }
  }, [destinoPuesto, vista])

  useEffect(() => {
    if (!reportPosition) {
      setReportAddress(null)
      setReportAddressLoading(false)
      return
    }

    const controller = new AbortController()
    const [lat, lon] = reportPosition
    setReportAddress(null)
    setReportAddressLoading(true)

    const resolveAddress = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
          { signal: controller.signal, headers: { Accept: 'application/json' } },
        )
        if (!response.ok) throw new Error('reverse-geocode-failed')
        const data = await response.json() as ReverseGeocodeResponse
        const address = data.address ?? {}
        const street = [address.road, address.house_number].filter(Boolean).join(' ')
        const locality = address.city ?? address.town ?? address.village ?? address.municipality ?? address.suburb
        const label = [street, locality].filter(Boolean).join(', ') || data.display_name?.split(',').slice(0, 2).join(', ')
        setReportAddress(label || null)
      } catch {
        if (!controller.signal.aborted) setReportAddress(null)
      } finally {
        if (!controller.signal.aborted) setReportAddressLoading(false)
      }
    }

    void resolveAddress()
    return () => controller.abort()
  }, [reportPosition])

  useEffect(() => {
    if (!position) return

    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return

    setUserPosition([position.lat, position.lng])
    if (pendingUserPositionFocus || !didFocusInitialUserPositionRef.current) {
      setFocusUserPositionKey((current) => current + 1)
      setPendingUserPositionFocus(false)
      didFocusInitialUserPositionRef.current = true
    }
  }, [pendingUserPositionFocus, position])

  const handleLocalizarme = () => {
    setPendingUserPositionFocus(true)
    requestGeo()

    if (currentUserPosition) {
      setFocusUserPositionKey((current) => current + 1)
      setPendingUserPositionFocus(false)
    }
  }

  useEffect(() => {
    if (!feedbackMessage) return
    const timeout = setTimeout(() => setFeedbackMessage(null), 3000)
    return () => clearTimeout(timeout)
  }, [feedbackMessage])

  useEffect(() => {
    void loadPendingSyncCount()
  }, [loadPendingSyncCount])

  useEffect(() => {
    const handleRealtimeUpdate = (event: Event) => {
      const realtimeEvent = (event as CustomEvent<{ event?: string }>).detail?.event
      if (realtimeEvent?.startsWith('incidencia:')) setRealtimeRefresh((current) => current + 1)
    }
    window.addEventListener('realtime:update', handleRealtimeUpdate)
    return () => window.removeEventListener('realtime:update', handleRealtimeUpdate)
  }, [])

  useEffect(() => () => {
    routeAbortControllerRef.current?.abort()
    if (routeTimeoutRef.current !== null) window.clearTimeout(routeTimeoutRef.current)
  }, [])

  useEffect(() => {
    const loadIncidencias = async () => {
      try {
        const { data } = await apiClient.get('/api/incidencias')
        const loaded = data.incidencias ?? []
        setIncidencias(loaded)
        await savePublicSnapshot('public:incidencias', loaded)
      } catch {
        setIncidencias(await readPublicSnapshot<IncidenciaMarker[]>('public:incidencias', []))
      }
    }

    void loadIncidencias()
  }, [realtimeRefresh])

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
    if (!currentUserPosition) {
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
    setDestinoNavegacion({
      id: puesto.id,
      nombre: puesto.nombre,
      latitud: puesto.latitud,
      longitud: puesto.longitud,
    })
    try {
      const incidenciasRuta = puesto.id.startsWith('incidencia:')
        ? incidencias.filter((incidencia) => `incidencia:${incidencia.id}` !== puesto.id)
        : incidencias
      const resultado = await fetchRutaSegura(currentUserPosition, [puesto.latitud, puesto.longitud], incidenciasRuta, controller.signal)
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
        setRouteError('Búsqueda de ruta cancelada.')
      } else if (aborted && routeAbortReasonRef.current === 'timeout') {
        setRouteError('La búsqueda de ruta ha tardado demasiado. Inténtalo de nuevo.')
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

  const handleComoLlegarPuesto = async (id: string) => {
    const puesto = puestos.find((p) => p.id === id)
    if (!puesto) return

    setSelectedId(id)
    await calcularRutaPuesto(puesto)
  }

  const handleComoLlegarIncidencia = async (incidencia: IncidenciaMarker) => {
    setSelectedId(null)
    await calcularRutaPuesto({
      id: `incidencia:${incidencia.id}`,
      nombre: incidencia.titulo?.trim() || 'Incidencia',
      direccion: incidencia.descripcion?.trim() || 'Punto de incidencia',
      latitud: incidencia.latitud,
      longitud: incidencia.longitud,
      necesidades: 0,
    })
  }

  const handleIniciarNavegacionDirecta = async () => {
    if (!currentUserPosition || !destinoNavegacion) return
    setNavLoading(true)
    setNavError(null)
    try {
      const resultado = await fetchRutaConPasos([
        currentUserPosition,
        [destinoNavegacion.latitud, destinoNavegacion.longitud],
      ], modoTransporte, destinoNavegacion.id.startsWith('incidencia:')
        ? incidencias.filter((incidencia) => `incidencia:${incidencia.id}` !== destinoNavegacion.id)
        : incidencias)
      setRoute(resultado.points)
      setStepsNavegacion(parsearStepsOsrm(resultado.legs as Parameters<typeof parsearStepsOsrm>[0]))
      setStepActualIdx(0)
      setOpcionesRutaProductos(null)
      muestrasFueraRutaRef.current = 0
      ultimaMuestraPosicionRef.current = ''
      anunciosRef.current = new Set()
      setVista('navegacion')
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'No se pudo iniciar la navegación guiada')
    } finally {
      setNavLoading(false)
    }
  }

  const handleCancelarRuta = () => {
    setRoute(null)
    setRouteInfo(null)
    setVista('default')
    setRouteError(null)
    setDestinoNavegacion(null)
  }

  const volverInicioCiudadano = () => {
    routeAbortReasonRef.current = 'cancel'
    routeAbortControllerRef.current?.abort()
    setVista('inicio')
    setPanelReturnVista('inicio')
    setRoute(null)
    setRouteInfo(null)
    setRouteError(null)
    setSelectedId(null)
    setDestinoNavegacion(null)
    setProductosSeleccionados([])
    setTextoBusquedaProducto('')
    setRadioBusquedaProductos('todos')
    setOpcionesRutaProductos(null)
    setRutaProductosPoints(null)
    setRutaProductosInfo(null)
    setStepsNavegacion([])
    setStepActualIdx(0)
    setHeadingDispositivo(null)
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setComentarioIncidencia(null)
    setHistorialComentariosIncidencia(null)
    setIsPickingLocation(false)
    setReportError(null)
    setReportSuccess(null)
    setPendingDuplicate(null)
    setReportPosition(null)
  }

  const submitIncidencia = async (force: boolean) => {
    if (!reportPosition) {
      setReportError('Selecciona un punto en el mapa para reportar la incidencia.')
      return
    }

    const titulo = reportTitulo.trim() || selectedReportCategory.label

    const body = {
      titulo,
      categoria: reportCategoria,
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
        titulo: body.titulo,
        categoria: body.categoria,
        latitud: body.latitud,
        longitud: body.longitud,
        estado: body.estado,
        descripcion: body.descripcion ?? null,
        createdAt: new Date().toISOString(),
        pendingSync: true,
      }

      setIncidencias((prev) => [pendingIncidencia, ...prev])
      setReportSuccess('Reporte guardado offline. Se enviará cuando vuelva la conexión.')
      setPendingDuplicate(null)
      setReportTitulo('')
      setReportCategoria('obstaculos_via')
      setReportDescripcion('')
      setReportPosition(null)
      setIsPickingLocation(false)
      setVista(panelReturnVista)
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
      setReportTitulo('')
      setReportCategoria('obstaculos_via')
      setReportDescripcion('')
      setReportPosition(null)
      setIsPickingLocation(false)
      setVista(panelReturnVista)
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

  const getCurrentPanelReturnVista = (): PanelReturnVista => (vista === 'inicio' ? 'inicio' : 'default')

  const abrirReporte = (position: [number, number] | null = null) => {
    setPanelReturnVista(getCurrentPanelReturnVista())
    setVista('reportar')
    setReportTitulo('')
    setReportCategoria('obstaculos_via')
    setReportDescripcion('')
    setReportError(null)
    setReportSuccess(null)
    setPendingDuplicate(null)
    setReportPosition(position)
    setIsPickingLocation(!position)
  }

  const abrirBusquedaProducto = () => {
    setPanelReturnVista(getCurrentPanelReturnVista())
    setProductosSeleccionados([])
    setTextoBusquedaProducto('')
    setRadioBusquedaProductos('todos')
    setOpcionesRutaProductos(null)
    setRutaProductosPoints(null)
    setRutaProductosInfo(null)
    setVista('buscar')
  }

  const handleAgregarProducto = (nombre: string) => {
    setProductosSeleccionados((prev) => (prev.includes(nombre) ? prev : [...prev, nombre]))
    setTextoBusquedaProducto('')
  }

  const handleQuitarProducto = (nombre: string) => {
    setProductosSeleccionados((prev) => prev.filter((p) => p !== nombre))
  }

  const handleLimpiarProductos = () => {
    setProductosSeleccionados([])
    setTextoBusquedaProducto('')
    setOpcionesRutaProductos(null)
    setRutaProductosPoints(null)
    setRutaProductosInfo(null)
    setRutaProductosError(null)
  }

  const calcularRutaOpcion = async (opcion: OpcionRutaProductos<PuestoMarker>, idx: number, modo: ModoTransporte) => {
    setOpcionRutaIdx(idx)
    if (!currentUserPosition || opcion.paradas.length === 0) return
    setRutaProductosLoading(true)
    setRutaProductosError(null)
    setRutaProductosPoints(null)
    try {
      const waypoints: [number, number][] = [
        currentUserPosition,
        ...opcion.paradas.map((p) => [p.puesto.latitud, p.puesto.longitud] as [number, number]),
      ]
      const resultado = await fetchRutaMultiParada(waypoints, incidencias, modo)
      setRutaProductosPoints(resultado.points)
      setRutaProductosInfo({ distanciaKm: resultado.distanciaKm, duracionMin: resultado.duracionMin, incidenciasCercanas: resultado.incidenciasCercanas })
    } catch (e) {
      setRutaProductosError(e instanceof Error ? e.message : 'No se pudo calcular la ruta')
    } finally {
      setRutaProductosLoading(false)
    }
  }

  const handleVerRutasProductos = () => {
    const puestosEnRadio = currentUserPosition && radioBusquedaProductos !== 'todos'
      ? puestos.filter((puesto) => puesto.distanciaKm === undefined || puesto.distanciaKm <= radioBusquedaProductos)
      : puestos
    const opciones = calcularOpcionesRutaProductos(productosSeleccionados, puestosEnRadio, inventarioPorPuesto)
    setOpcionesRutaProductos(opciones)
    setOpcionRutaIdx(0)
    setRutaProductosPoints(null)
    setRutaProductosInfo(null)
    setVista('ruta-productos')
    if (opciones.length > 0) void calcularRutaOpcion(opciones[0], 0, modoTransporte)
  }

  const handleSeleccionarOpcionRuta = (idx: number) => {
    if (!opcionesRutaProductos?.[idx]) return
    void calcularRutaOpcion(opcionesRutaProductos[idx], idx, modoTransporte)
  }

  const handleCambiarModoTransporte = (modo: ModoTransporte) => {
    setModoTransporte(modo)
    const opcion = opcionesRutaProductos?.[opcionRutaIdx]
    if (opcion) void calcularRutaOpcion(opcion, opcionRutaIdx, modo)
  }

  const handleIniciarNavegacionProductos = async () => {
    if (!opcionesRutaProductos?.[opcionRutaIdx] || !currentUserPosition) return
    const opcion = opcionesRutaProductos[opcionRutaIdx]
    if (opcion.paradas.length === 0) return
    setNavLoading(true)
    setRutaProductosError(null)
    try {
      const waypoints: [number, number][] = [
        currentUserPosition,
        ...opcion.paradas.map((p) => [p.puesto.latitud, p.puesto.longitud] as [number, number]),
      ]
      const resultado = await fetchRutaConPasos(waypoints, modoTransporte, incidencias)
      const steps = parsearStepsOsrm(resultado.legs as Parameters<typeof parsearStepsOsrm>[0])
      setSelectedId(opcion.paradas[opcion.paradas.length - 1].puesto.id)
      setRoute(resultado.points)
      setStepsNavegacion(steps)
      setStepActualIdx(0)
      setNavError(null)
      muestrasFueraRutaRef.current = 0
      ultimaMuestraPosicionRef.current = ''
      anunciosRef.current = new Set()
      setVista('navegacion')
      // Request compass permission on iOS 13+
      type DoeWithPerm = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
      const DoE = DeviceOrientationEvent as DoeWithPerm
      if (typeof DoE.requestPermission === 'function') {
        DoE.requestPermission().catch(() => undefined)
      }
    } catch (e) {
      setRutaProductosError(e instanceof Error ? e.message : 'No se pudo iniciar la navegación')
    } finally {
      setNavLoading(false)
    }
  }

  const abrirComentarioIncidencia = (
    incidencia: IncidenciaMarker,
    estado: EstadoVia,
    comentario = '',
  ) => {
    setHistorialComentariosIncidencia(null)
    setComentarioIncidencia(incidencia)
    setComentarioEstado(estado)
    setComentarioTexto(comentario)
    setComentarioError(null)
  }

  const abrirHistorialComentariosIncidencia = (incidencia: IncidenciaMarker) => {
    setComentarioIncidencia(null)
    setComentarioTexto('')
    setComentarioError(null)
    setHistorialComentariosIncidencia(incidencia)
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
      setComentarioError('Escribe un comentario para guardar la actualización.')
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
    queryFn: async () => {
      try {
        const response = await apiClient.get<{ puestos: Omit<PuestoMarker, 'distanciaKm'>[] }>('/api/puestos')
        return await savePublicSnapshot('public:puestos', response.data.puestos)
      } catch {
        return readPublicSnapshot<Omit<PuestoMarker, 'distanciaKm'>[]>('public:puestos', [])
      }
    },
    staleTime: 1000 * 30,
    retry: false,     // no reintentar en offline
    placeholderData: [], // evitar parpadeo mientras carga
  })

  const puestosBase = destinoPuesto
    ? [destinoPuesto, ...(puestosApiData ?? []).filter((puesto) => puesto.id !== destinoPuesto.id)]
    : puestosApiData ?? []

  const puestos: PuestoMarker[] = currentUserPosition
    ? sortByDistance(puestosBase, currentUserPosition[0], currentUserPosition[1])
    : puestosBase.map((p) => ({ ...p }))

  const puestoIds = puestosBase.map((puesto) => puesto.id)
  const { data: inventarioApiData } = useQuery({
    queryKey: ['inventario-ciudadano-busqueda', puestoIds],
    queryFn: async () => {
      try {
        const response = await apiClient.get<{ inventario: (ApiInventarioItem & { puestoId: string })[] }>('/api/inventario')
        const allItems = response.data.inventario ?? []

        const grouped: Record<string, ApiInventarioItem[]> = {}
        puestosBase.forEach((p) => {
          grouped[p.id] = []
        })
        allItems.forEach((item) => {
          if (grouped[item.puestoId] !== undefined) {
            grouped[item.puestoId].push(item)
          } else {
            grouped[item.puestoId] = [item]
          }
        })

        const entries = puestosBase.map((puesto) => {
          const items = grouped[puesto.id] ?? []
          return [puesto.id, normalizeApiInventario(items)] as const
        })
        const groupedInventory = Object.fromEntries(entries) as InventarioPorPuesto
        return await savePublicSnapshot('public:inventario', groupedInventory)
      } catch {
        return readPublicSnapshot<InventarioPorPuesto>('public:inventario', {})
      }
    },
    enabled: puestosBase.length > 0,
    staleTime: 1000 * 30,
    retry: false,
    placeholderData: {},
  })

  const inventarioPorPuesto = useMemo<InventarioPorPuesto>(() => inventarioApiData ?? {}, [inventarioApiData])

  const productosDisponibles = getProductosDisponibles(puestos, inventarioPorPuesto)
  const productoOptions = getProductoOptions(productosDisponibles)
  const productosRecomendados = _getProductosRecomendados(productosDisponibles)
  const selectedPuesto = selectedId ? puestos.find((p) => p.id === selectedId) ?? null : null
  const puestosOpcionActual = opcionesRutaProductos?.[opcionRutaIdx]?.paradas.map((p) => p.puesto) ?? []

  useEffect(() => {
    if (!destinoPuesto || !currentUserPosition || routeLoading) return
    if (autoRouteTargetRef.current === destinoPuesto.id) return

    const puesto = puestos.find((item) => item.id === destinoPuesto.id)
    if (!puesto) return

    autoRouteTargetRef.current = destinoPuesto.id
    setSelectedId(puesto.id)
    void calcularRutaPuesto(puesto)
  }, [currentUserPosition, destinoPuesto, puestos, routeLoading])

  // ── Brújula (DeviceOrientation) ───────────────────────────────────────────
  useEffect(() => {
    if (vista !== 'navegacion') return
    type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number }
    const handler = (e: OrientationEvt) => {
      // webkitCompassHeading (iOS): degrees clockwise from North, already absolute
      // alpha (Android absolute): degrees counter-clockwise → convert to clockwise
      const heading =
        e.webkitCompassHeading != null
          ? e.webkitCompassHeading
          : e.alpha != null
            ? (360 - e.alpha) % 360
            : null
      if (heading != null) setHeadingDispositivo(Math.round(heading))
    }
    window.addEventListener('deviceorientationabsolute', handler as EventListener, true)
    window.addEventListener('deviceorientation', handler as EventListener, true)
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener, true)
      window.removeEventListener('deviceorientation', handler as EventListener, true)
    }
  }, [vista])

  // ── Seguimiento de paso + avance automático ───────────────────────────────
  useEffect(() => {
    if (vista !== 'navegacion' || !currentUserPosition || stepsNavegacion.length === 0) return
    const step = stepsNavegacion[stepActualIdx]
    if (!step) return
    const distM = distanciaAlStep(currentUserPosition[0], currentUserPosition[1], step)
    const reachedIdx = pasoAlcanzadoPorPosicion(
      currentUserPosition[0],
      currentUserPosition[1],
      stepsNavegacion,
      stepActualIdx,
    )
    if (reachedIdx > stepActualIdx) {
      setStepActualIdx(reachedIdx)
      muestrasFueraRutaRef.current = 0
      return
    }
    if (step.tipo === 'arrive') return

    const distanciaRutaM = route
      ? distanciaAPolilinea(currentUserPosition[0], currentUserPosition[1], route)
      : 0
    const positionSample = `${currentUserPosition[0].toFixed(6)},${currentUserPosition[1].toFixed(6)}`
    if (positionSample !== ultimaMuestraPosicionRef.current) {
      ultimaMuestraPosicionRef.current = positionSample
      muestrasFueraRutaRef.current = distanciaRutaM > 60 ? muestrasFueraRutaRef.current + 1 : 0
    }

    const opcionActiva = opcionesRutaProductos?.[opcionRutaIdx]
    const tieneDestinoRecalculable = Boolean(opcionActiva || destinoNavegacion)
    const puedeRecalcular =
      muestrasFueraRutaRef.current >= 3 &&
      !recalculandoRuta &&
      tieneDestinoRecalculable &&
      Date.now() - ultimoRecalculoRef.current > 20_000

    if (puedeRecalcular) {
      const paradasRestantes: [number, number][] = opcionActiva
        ? opcionActiva.paradas
            .slice(step.legIndex ?? 0)
            .map((parada) => [parada.puesto.latitud, parada.puesto.longitud] as [number, number])
        : destinoNavegacion
          ? [[destinoNavegacion.latitud, destinoNavegacion.longitud]]
          : []
      if (paradasRestantes.length > 0) {
        ultimoRecalculoRef.current = Date.now()
        muestrasFueraRutaRef.current = 0
        setRecalculandoRuta(true)
        setNavError(null)
        const waypoints: [number, number][] = [
          currentUserPosition,
          ...paradasRestantes,
        ]
        const incidenciasRecalculo = destinoNavegacion?.id.startsWith('incidencia:')
          ? incidencias.filter((incidencia) => `incidencia:${incidencia.id}` !== destinoNavegacion.id)
          : incidencias
        void fetchRutaConPasos(waypoints, modoTransporte, incidenciasRecalculo)
          .then((resultado) => {
            const nextSteps = parsearStepsOsrm(resultado.legs as Parameters<typeof parsearStepsOsrm>[0])
            setRoute(resultado.points)
            setStepsNavegacion(nextSteps)
            setStepActualIdx(0)
            anunciosRef.current = new Set()
          })
          .catch(() => setNavError('No se pudo recalcular la ruta. Continúa con precaución o inténtalo de nuevo.'))
          .finally(() => setRecalculandoRuta(false))
      }
    }
    // Voice pre-announcements: 200 m and 50 m thresholds
    for (const threshold of [200, 50] as const) {
      const key = `${stepActualIdx}-${threshold}`
      if (!anunciosRef.current.has(key) && distM <= threshold + 10 && distM > threshold - 40) {
        anunciosRef.current.add(key)
        if (vozActiva && typeof speechSynthesis !== 'undefined') {
          speechSynthesis.cancel()
          const u = new SpeechSynthesisUtterance(
            `En ${formatearDistanciaNav(Math.round(distM))}, ${step.instruccion}`,
          )
          u.lang = 'es-ES'
          u.rate = 0.95
          speechSynthesis.speak(u)
        }
      }
    }
    // Keep map centered on user during navigation
    setFocusUserPositionKey((k) => k + 1)
  }, [currentUserPosition, destinoNavegacion, incidencias, modoTransporte, opcionRutaIdx, opcionesRutaProductos, recalculandoRuta, route, stepActualIdx, stepsNavegacion, vista, vozActiva])

  // ── Announce step on change ───────────────────────────────────────────────
  useEffect(() => {
    if (vista !== 'navegacion' || stepsNavegacion.length === 0) return
    const step = stepsNavegacion[stepActualIdx]
    if (!step) return
    if (vozActiva && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(step.instruccion)
      u.lang = 'es-ES'
      u.rate = 0.95
      speechSynthesis.speak(u)
    }
    anunciosRef.current = new Set()
  // Only re-run when step index or vozActiva changes (not on every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepActualIdx, vista])

  return (
    <div className="flex flex-col h-full">

      {/* Banner de ruta activa */}
      {vista === 'ruta' && routeInfo && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm">
            {modoTransporte === 'foot' ? '🚶' : '🚗'}
            {' '}<strong>{routeInfo.distanciaKm.toFixed(1)} km</strong>
            {' · '}<strong>{formatearTiempo(routeInfo.duracionMin)}</strong>
            {selectedPuesto && ` · ${selectedPuesto.nombre}`}
            {routeInfo.incidenciasEvitadas > 0 && ` · evita ${routeInfo.incidenciasEvitadas} corte${routeInfo.incidenciasEvitadas === 1 ? '' : 's'}`}
            {routeInfo.incidenciasCercanas > 0 && ` · ${routeInfo.incidenciasCercanas} corte${routeInfo.incidenciasCercanas === 1 ? '' : 's'} cerca`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleIniciarNavegacionDirecta()}
              disabled={navLoading || !destinoNavegacion}
              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
            >
              Iniciar navegación
            </button>
            <button
              onClick={handleCancelarRuta}
              className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {vista === 'inicio' && (
        <CiudadanoInicio
          onVerMapa={() => {
            setPanelReturnVista('inicio')
            setVista('default')
          }}
          onBuscarProducto={abrirBusquedaProducto}
          onReportarIncidencia={() => abrirReporte()}
        />
      )}

      {(vista === 'default' || vista === 'ruta' || vista === 'reportar' || vista === 'inventario' || vista === 'navegacion') && (
      <div
        className="relative flex-1 min-h-0"
      >
        <Map
          center={currentUserPosition ?? [39.4250, -0.4000]}
          zoom={vista === 'navegacion' ? 17 : 13}
          userPosition={currentUserPosition}
          reportPoint={reportPosition}
          selectingReportPoint={vista === 'reportar'}
          puestos={puestos}
          incidencias={incidencias}
          selectedPuestoId={selectedId}
          onPuestoSelect={handleSelectPuesto}
          onVerInventarioPuesto={(id) => { setSelectedId(id); setVista('inventario') }}
          onComoLlegarPuesto={(id) => { void handleComoLlegarPuesto(id) }}
          onComoLlegarIncidencia={(incidencia) => { void handleComoLlegarIncidencia(incidencia) }}
          onUserLocated={setUserPosition}
          onReportPointSelect={(pos) => {
            setReportPosition(pos)
            setReportError(null)
            setReportSuccess(null)
          }}
          onIncidenciaAction={handleIncidenciaAction}
          onIncidenciaCommentsOpen={abrirHistorialComentariosIncidencia}
          route={route}
          focusUserPositionKey={focusUserPositionKey}
          markerVariant="neutral"
          className="h-full w-full"
        />

        {feedbackMessage && (
          <div className="pointer-events-none absolute left-4 right-4 top-16 z-[1400] flex justify-center">
            <div className="max-w-sm rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-medium text-green-800 shadow-xl">
              {feedbackMessage}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={volverInicioCiudadano}
          className="absolute bottom-6 left-1/2 z-[1200] min-w-40 -translate-x-1/2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xl transition-colors hover:bg-blue-700"
        >
          Volver
        </button>

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


        {/* Botón localizarme */}
        <button
          onClick={handleLocalizarme}
          disabled={geoLoading}
          className="absolute top-3 right-12 z-[700] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {geoLoading ? '🔄 Localizando…' : '📍 Localizarme'}
        </button>

        {vista === 'reportar' && (
          <div className="absolute top-12 right-3 z-[1000] bg-red-600/90 text-white rounded-xl px-3 py-2 text-xs shadow-lg max-w-[180px] text-center">
            {isPickingLocation
              ? 'Toca el mapa para marcar la calle de la incidencia.'
              : 'Punto marcado. Puedes cambiarlo pulsando "Cambiar punto".'}
          </div>
        )}

        {/* ── Overlay navegación paso a paso ────────────────────────────── */}
        {vista === 'navegacion' && (
          <>
            {(recalculandoRuta || navError) && (
              <div className={`absolute inset-x-3 top-3 z-[1300] rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${navError ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                {navError ?? 'Te has alejado de la ruta. Recalculando indicaciones…'}
              </div>
            )}
            {navLoading && (
              <div className="absolute inset-0 z-[1300] flex items-center justify-center bg-white/70">
                <div className="flex items-center gap-3 rounded-xl bg-white border border-gray-200 shadow-xl px-5 py-4">
                  <span className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <span className="text-sm font-medium text-gray-800">Calculando guía…</span>
                </div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 z-[1200]">
              <PanelNavegacionActiva
                steps={stepsNavegacion}
                stepIdx={stepActualIdx}
                userPosition={currentUserPosition}
                headingDispositivo={headingDispositivo}
                modo={modoTransporte}
                vozActiva={vozActiva}
                onToggleVoz={() => {
                  if (vozActiva && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
                  setVozActiva((v) => !v)
                }}
                onAvanzar={() => setStepActualIdx((i) => Math.min(i + 1, stepsNavegacion.length - 1))}
                onRetroceder={() => setStepActualIdx((i) => Math.max(i - 1, 0))}
                onFinalizar={volverInicioCiudadano}
              />
            </div>
          </>
        )}

      </div>
      )}

      {/* Acciones rápidas */}
      <div className="hidden">
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
        <Button variant="ghost" size="sm" fullWidth onClick={() => setVista('inicio')} className="col-span-2">
          Volver al inicio
        </Button>
      </div>

      {/* Lista de puestos */}
      <div className="hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            Puestos de emergencia
            {loadingPuestos
              ? <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500 inline-block" />
              : <span className="font-normal text-gray-400">({puestos.length})</span>
            }
          </h2>
          {currentUserPosition && <span className="text-xs text-blue-600">Por distancia</span>}
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
                        Cancelar búsqueda de ruta
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
        <SelectorProductosSheet
          productosSeleccionados={productosSeleccionados}
          productosRecomendados={productosRecomendados}
          productoOptions={productoOptions}
          textoBusqueda={textoBusquedaProducto}
          userPosition={currentUserPosition}
          onTextoBusquedaChange={setTextoBusquedaProducto}
          onAgregarProducto={handleAgregarProducto}
          onQuitarProducto={handleQuitarProducto}
          onLimpiarProductos={handleLimpiarProductos}
          onVerRutas={handleVerRutasProductos}
          onClose={() => setVista(panelReturnVista)}
        />
      )}

      {vista === 'ruta-productos' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Banner con info de ruta calculada */}
          {rutaProductosInfo && !rutaProductosLoading && (
            <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
              <span className="text-sm">
                {modoTransporte === 'driving' ? '🚗' : '🚶'}
                {' '}<strong>{rutaProductosInfo.distanciaKm.toFixed(1)} km</strong>
                {' · '}<strong>{formatearTiempo(rutaProductosInfo.duracionMin)}</strong>
                {opcionesRutaProductos?.[opcionRutaIdx]?.paradas.length === 1
                  ? ` · ${opcionesRutaProductos[opcionRutaIdx].paradas[0].puesto.nombre}`
                  : ` · ${opcionesRutaProductos?.[opcionRutaIdx]?.paradas.length ?? 0} paradas`}
                {rutaProductosInfo.incidenciasCercanas > 0 && ` · ${rutaProductosInfo.incidenciasCercanas} incidencia${rutaProductosInfo.incidenciasCercanas === 1 ? '' : 's'} cerca`}
              </span>
            </div>
          )}

          {/* Mapa — porción superior */}
          <div className="relative h-52 flex-shrink-0">
            <Map
              center={
                puestosOpcionActual[0]
                  ? [puestosOpcionActual[0].latitud, puestosOpcionActual[0].longitud]
                  : currentUserPosition ?? [39.4250, -0.4000]
              }
              zoom={13}
              userPosition={currentUserPosition}
              reportPoint={null}
              selectingReportPoint={false}
              puestos={puestos}
              incidencias={incidencias}
              selectedPuestoId={puestosOpcionActual[0]?.id ?? null}
              onPuestoSelect={() => undefined}
              onReportPointSelect={() => undefined}
              onIncidenciaAction={() => undefined}
              onIncidenciaCommentsOpen={() => undefined}
              route={rutaProductosPoints}
              focusUserPositionKey={focusUserPositionKey}
              markerVariant="neutral"
              className="h-full w-full"
            />
            <button
              type="button"
              onClick={handleLocalizarme}
              disabled={geoLoading}
              className="absolute top-2 right-2 z-[700] bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {geoLoading ? '🔄' : '📍'} Localizarme
            </button>
          </div>

          {/* Panel de opciones — porción inferior scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-white">
            <OpcionesRutaProductosPanel
              opciones={opcionesRutaProductos ?? []}
              opcionIdx={opcionRutaIdx}
              productosSeleccionados={productosSeleccionados}
              modo={modoTransporte}
              loading={rutaProductosLoading}
              navLoading={navLoading}
              error={rutaProductosError}
              userPosition={currentUserPosition}
              onSeleccionarOpcion={handleSeleccionarOpcionRuta}
              onCambiarModo={handleCambiarModoTransporte}
              onIniciarNavegacion={() => void handleIniciarNavegacionProductos()}
              onVolver={() => setVista('buscar')}
            />
          </div>
        </div>
      )}

      {historialComentariosIncidencia && (
        <HistorialComentariosSheet
          incidencia={historialComentariosIncidencia}
          onClose={() => setHistorialComentariosIncidencia(null)}
        />
      )}

      {comentarioIncidencia && (
        <ActualizarIncidenciaSheet
          estado={comentarioEstado}
          texto={comentarioTexto}
          error={comentarioError}
          loading={comentarioLoading}
          onEstadoChange={setComentarioEstado}
          onTextoChange={setComentarioTexto}
          onSubmit={handleSubmitComentarioIncidencia}
          onClose={() => {
            setComentarioIncidencia(null)
            setComentarioTexto('')
            setComentarioError(null)
          }}
        />
      )}

      {/* Panel de reporte de calles */}
      {vista === 'reportar' && (
        <div className={`fixed inset-x-0 bottom-0 z-[2000] flex flex-col rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl ${isPickingLocation ? 'max-h-[34vh]' : 'max-h-[76vh]'}`}>
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-3 pt-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Nueva incidencia</p>
              <p className="text-lg font-semibold text-gray-950">Reportar calle</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setVista(panelReturnVista)
                setIsPickingLocation(false)
                setReportError(null)
                setReportSuccess(null)
                setPendingDuplicate(null)
                setReportTitulo('')
                setReportCategoria('obstaculos_via')
                setReportDescripcion('')
                setReportPosition(null)
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50"
              aria-label="Cerrar reporte"
            >
              x
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-4">
            {isPickingLocation ? (
              <div className="space-y-3">
                {reportPosition && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <p className="text-sm font-semibold text-green-900">Punto marcado</p>
                    <p className="mt-0.5 text-xs text-green-700">
                      {reportLocationLabel}
                    </p>
                  </div>
                )}

                {currentUserPosition && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setReportPosition(currentUserPosition)
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
                  <p className="text-xs text-slate-500">{reportLocationLabel}</p>
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Toca el mapa para elegir la calle exacta.
                </p>
              )}

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
                  Cambiar ubicación
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo de problema</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS_INCIDENCIA.map((categoria) => {
                  const selected = reportCategoria === categoria.value
                  return (
                    <button
                      key={categoria.value}
                      type="button"
                      onClick={() => {
                        setReportCategoria(categoria.value)
                        setReportError(null)
                      }}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        selected
                          ? 'border-red-300 bg-red-50 text-red-800 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{categoria.label}</span>
                      <span className="mt-1 block truncate text-xs opacity-70">
                        {categoria.equipment.slice(0, 2).join(', ')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Detalle opcional</label>
                <span className="text-xs text-gray-400">{reportDescripcion.length}/500</span>
              </div>
              <textarea
                rows={3}
                value={reportDescripcion}
                onChange={(e) => {
                  setReportDescripcion(e.target.value)
                  setReportError(null)
                }}
                maxLength={500}
                className="w-full resize-none rounded-xl border-gray-300 bg-white text-sm text-gray-900 shadow-sm focus:border-red-500 focus:ring-red-500"
                placeholder="Ejemplo: Hay agua acumulada y no pasan vehículos."
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

            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resumen</p>
              <p className="mt-2 text-sm font-medium leading-snug text-gray-900">
                Se reportara <span className="font-semibold text-red-700">{selectedReportCategory.label.toLocaleLowerCase('es')}</span>
                {reportPosition ? <> en <span className="font-semibold">{reportLocationLabel}</span></> : ' cuando marques una ubicación'}.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {reportDescripcion.trim()
                  ? `Detalle: ${reportDescripcion.trim()}`
                  : 'No has añadido detalles. El reporte se enviará solo con el tipo y la ubicación.'}
              </p>
            </div>

              </>
            )}
          </div>
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setVista(panelReturnVista)
                  setIsPickingLocation(false)
                  setReportError(null)
                  setReportSuccess(null)
                  setPendingDuplicate(null)
                  setReportTitulo('')
                  setReportCategoria('obstaculos_via')
                  setReportDescripcion('')
                  setReportPosition(null)
                }}
                className="h-11"
              >
                Cancelar
              </Button>
              <Button
                fullWidth
                loading={!isPickingLocation && reportLoading}
                disabled={!reportPosition}
                onClick={() => {
                  if (isPickingLocation) {
                    setIsPickingLocation(false)
                    setReportError(null)
                    return
                  }
                  void handleReportarCalle()
                }}
                className="h-11 bg-red-600 hover:bg-red-700 active:bg-red-800"
              >
                {isPickingLocation
                  ? (reportPosition ? 'Confirmar punto' : 'Toca el mapa')
                  : (reportPosition ? 'Enviar reporte' : 'Marca una ubicación')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
