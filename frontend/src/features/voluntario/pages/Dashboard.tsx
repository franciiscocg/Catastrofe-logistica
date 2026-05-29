import { useEffect, useMemo, useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'
import type { PuestoEmergencia } from '@/types/puesto.types'
import type { ItemInventario } from '@/types/inventario.types'
import Map, { type IncidenciaMarker, type PuestoMarker } from '@/components/shared/Map'
import QrScanner from '@/components/shared/QrScanner'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useConnectivity } from '@/hooks/useConnectivity'
import { useSyncStore } from '@/store/sync.store'
import { sortByDistance, haversineKm } from '@/utils/haversine'
import { fetchRutaEvitandoIncidencias, fetchRutaConPasos } from '@/utils/routing'
import { parsearStepsOsrm, formatearDistanciaNav, calcularBearing, distanciaAlStep, ROTACION_ICONO, type StepNavegacion } from '@/utils/navegacion'
import { getApiErrorMessage } from '@/utils/errors'
import {
  ActionCard,
  EmptyState,
  Notice,
  RouteSafetyPanel,
  SectionHeader,
  actionMeta,
} from '../components/DashboardUi'
import { AddInventarioPuestoSheet, OperacionInventarioPuestoSheet } from '../components/InventarioPuestoSheets'
import {
  SUGERENCIAS_INVENTARIO_PUESTO,
  getInventarioProductoKey,
  type InventarioPuestoCard,
  type OperacionInventarioPuesto,
} from '../components/inventarioPuesto'
import NuevoFlujoDonacion from '../components/NuevoFlujoDonacion'

type AccionVoluntario = 'donacion' | 'incidencia' | 'puesto'
type VistaDonacion = 'objetos' | 'necesidades' | 'mis-donaciones'
type FiltroInventarioPuesto = 'todos' | 'disponible' | 'necesario' | 'critico'
type ActividadManualActiva = {
  tipo: 'incidencia' | 'puesto'
  id: string
  nombre: string
}

type OcupacionPuesto = {
  capacidad: number
  trabajando: number
}

type Incidencia = {
  id: string
  titulo?: string | null
  categoria?: string | null
  latitud: number
  longitud: number
  estado: 'CORTADA' | 'TRANSITABLE'
  descripcion?: string | null
  createdAt: string
  distanciaKm?: number
  _count?: { comentarios: number; asignacionesVoluntarios?: number }
}

type Necesidad = {
  puesto: PuestoEmergencia
  item: ItemInventario
  cantidadNecesaria?: number
  cantidadComprometida?: number
  cantidadPendiente?: number
  prioridad?: string
}

type NecesidadDonacionApi = {
  id: string
  puesto: PuestoEmergencia
  producto: ItemInventario['producto']
  cantidadNecesaria: number
  cantidadComprometida: number
  cantidadPendiente: number
  unidad: string
  prioridad: string
  updatedAt: string
}

type Donacion = {
  id: string
  cantidad: number
  unidad: string
  estado: 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'
  comentario?: string | null
  eta?: string | null
  entregaCodigo?: string | null
  entregaCodigoGeneradoAt?: string | null
  producto: ItemInventario['producto']
  puesto: PuestoEmergencia
}

type AsignacionPuestoActiva = {
  id: string
  puestoId: string
  estado: 'ACTIVA' | 'FINALIZADA' | 'CANCELADA'
  startedAt?: string
  endedAt?: string | null
  puesto: PuestoEmergencia
}

type SolicitudParticipacionPuesto = {
  id: string
  puestoId: string
  usuarioId: string
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
  motivoRechazo?: string | null
  createdAt: string
  puesto: PuestoEmergencia
}

type AsignacionIncidenciaActiva = {
  id: string
  incidenciaId: string
  estado: 'ACTIVA' | 'FINALIZADA' | 'CANCELADA'
  startedAt?: string
  endedAt?: string | null
  incidencia: Incidencia
}

type CategoriaIncidenciaConfig = {
  label: string
  equipment: string[]
  keywords: string[]
}

const CATEGORIAS_INCIDENCIA: Record<string, CategoriaIncidenciaConfig> = {
  inundacion: {
    label: 'Inundacion',
    equipment: ['Cubo', 'Guantes impermeables', 'Botas de agua', 'Chaleco reflectante'],
    keywords: ['agua', 'inundacion', 'inundado', 'lluvia', 'barro', 'balsa'],
  },
  obstaculos_via: {
    label: 'Obstaculos en via',
    equipment: ['Guantes', 'Palanca o herramienta de carga', 'Carretilla', 'Chaleco reflectante'],
    keywords: ['obstaculo', 'escombro', 'arbol', 'rama', 'coche', 'bloqueo', 'cortada', 'calle'],
  },
  limpieza: {
    label: 'Limpieza y retirada',
    equipment: ['Guantes', 'Mascarilla', 'Escoba o pala', 'Bolsas resistentes'],
    keywords: ['limpieza', 'basura', 'lodo', 'residuo', 'retirada'],
  },
  asistencia: {
    label: 'Asistencia a personas',
    equipment: ['Botiquin basico', 'Agua', 'Manta termica', 'Telefono con bateria'],
    keywords: ['persona', 'herido', 'ayuda', 'asistencia', 'vecino', 'mayor'],
  },
}

const DEFAULT_CATEGORIA_INCIDENCIA = 'obstaculos_via'

function cardClass(selected: boolean, disabled = false) {
  return `rounded-lg border bg-white shadow-sm transition-all duration-200 ${
    selected
      ? 'border-cyan-500 ring-2 ring-cyan-100'
      : disabled
        ? 'border-slate-200 opacity-60'
        : 'border-slate-200 hover:border-slate-400 hover:shadow-lg'
  }`
}

function isDonacionActiva(donacion: Donacion) {
  return donacion.estado === 'PENDIENTE' || donacion.estado === 'EN_CAMINO'
}

function createCodigoEntregaPayload(donacion: Donacion, entregaCodigo: string) {
  return JSON.stringify({
    t: 'DE',
    v: 1,
    e: entregaCodigo,
    d: donacion.id,
    p: donacion.puesto.id,
    pr: donacion.producto.id,
    n: donacion.producto.nombre,
    c: donacion.producto.categoria,
    q: donacion.cantidad,
    u: donacion.unidad,
    g: Date.now(),
  })
}

function createOfflineEntregaCodigo(donacionId: string) {
  return `OFFLINE-${donacionId}-${Date.now()}`
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleString()
}

function normalizeIncidenciaText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function getIncidenciaCategoriaKey(incidencia: Incidencia) {
  const explicitCategory = normalizeIncidenciaText(incidencia.categoria)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (explicitCategory && CATEGORIAS_INCIDENCIA[explicitCategory]) return explicitCategory

  const text = normalizeIncidenciaText(`${incidencia.titulo ?? ''} ${incidencia.descripcion ?? ''}`)
  const match = Object.entries(CATEGORIAS_INCIDENCIA).find(([, config]) => (
    config.keywords.some((keyword) => text.includes(normalizeIncidenciaText(keyword)))
  ))

  return match?.[0] ?? DEFAULT_CATEGORIA_INCIDENCIA
}

function getIncidenciaCategoria(incidencia: Incidencia) {
  return CATEGORIAS_INCIDENCIA[getIncidenciaCategoriaKey(incidencia)]
}

function getIncidenciaTitulo(incidencia: Incidencia) {
  if (incidencia.titulo?.trim()) return incidencia.titulo.trim()
  const categoria = getIncidenciaCategoria(incidencia).label
  return `${categoria} #${incidencia.id.slice(-4).toUpperCase()}`
}

function getIncidenciaResumen(incidencia: Incidencia) {
  return incidencia.descripcion?.trim() || 'Sin descripcion disponible.'
}

function normalizeTipoInventario(tipo: string): 'disponible' | 'necesario' {
  return tipo.toLocaleLowerCase('es') === 'necesario' ? 'necesario' : 'disponible'
}

function getNivelInventario(item: ItemInventario) {
  if (normalizeTipoInventario(item.tipo) === 'necesario') return 'necesario'
  if (item.cantidad <= 5 || item.nivelStock === 'critico') return 'critico'
  if (item.cantidad <= 20 || item.nivelStock === 'bajo') return 'bajo'
  return item.nivelStock
}

function isInventarioVirtual(item: ItemInventario) {
  return item.id.startsWith('basico:')
}

function isProductoBasico(producto: Pick<ItemInventario['producto'], 'nombre' | 'unidad'>) {
  const key = getInventarioProductoKey(producto)
  return SUGERENCIAS_INVENTARIO_PUESTO.some((item) => getInventarioProductoKey(item) === key)
}

function createInventarioBasico(item: typeof SUGERENCIAS_INVENTARIO_PUESTO[number]): ItemInventario {
  const id = `basico:${item.nombre.toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, '-')}`

  return {
    id,
    puestoId: 'virtual',
    producto: {
      id,
      nombre: item.nombre,
      categoria: item.categoria,
      unidad: item.unidad,
    },
    cantidad: 0,
    tipo: 'disponible',
    nivelStock: 'critico',
    updatedAt: new Date(0).toISOString(),
  }
}

function productoDonableKey(producto: ItemInventario['producto']) {
  return `${producto.id}:${producto.nombre}:${producto.unidad}`
}

function ocupacionInicialPuesto(puesto: PuestoEmergencia, index: number): OcupacionPuesto {
  const base = {
    capacidad: puesto.capacidadTrabajo ?? 4 + (index % 3) * 2,
    trabajando: puesto.voluntariosTrabajando ?? 0,
  }

  return {
    capacidad: Math.max(1, Math.trunc(base.capacidad)),
    trabajando: Math.max(0, Math.min(Math.trunc(base.trabajando), Math.max(1, Math.trunc(base.capacidad)))),
  }
}

export default function VoluntarioDashboard() {
  const queryClient = useQueryClient()
  const [accion, setAccion] = useState<AccionVoluntario | null>(null)
  const [puestos, setPuestos] = useState<PuestoEmergencia[]>([])
  const [inventarioPorPuesto, setInventarioPorPuesto] = useState<Record<string, ItemInventario[]>>({})
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [necesidadesApi, setNecesidadesApi] = useState<Necesidad[]>([])
  const [misDonaciones, setMisDonaciones] = useState<Donacion[]>([])
  const [misAsignacionesPuesto, setMisAsignacionesPuesto] = useState<AsignacionPuestoActiva[]>([])
  const [misAsignacionesIncidencia, setMisAsignacionesIncidencia] = useState<AsignacionIncidenciaActiva[]>([])
  const [misSolicitudesParticipacion, setMisSolicitudesParticipacion] = useState<SolicitudParticipacionPuesto[]>([])
  const [puestoActivoAsignado, setPuestoActivoAsignado] = useState<PuestoEmergencia | null>(null)
  const [inventarioPuestoActivo, setInventarioPuestoActivo] = useState<ItemInventario[]>([])
  const [inventarioPuestoActivoLoading, setInventarioPuestoActivoLoading] = useState(false)
  const [inventarioPuestoQuery, setInventarioPuestoQuery] = useState('')
  const [inventarioPuestoFiltro, setInventarioPuestoFiltro] = useState<FiltroInventarioPuesto>('todos')
  const [showAddInventarioPuesto, setShowAddInventarioPuesto] = useState(false)
  const [inventarioPuestoError, setInventarioPuestoError] = useState('')
  const [operacionInventarioPuesto, setOperacionInventarioPuesto] = useState<{
    card: InventarioPuestoCard
    operacion: OperacionInventarioPuesto
  } | null>(null)
  const [showPuestoQr, setShowPuestoQr] = useState(false)
  const [puestoQrResult, setPuestoQrResult] = useState('')
  const [loading, setLoading] = useState(true)
  const [seleccion, setSeleccion] = useState('')
  // const [seleccionObjetosDonacion, setSeleccionObjetosDonacion] = useState<Record<string, SeleccionObjetoDonacion>>({})
  const [_rutaDonacionPlan, _setRutaDonacionPlan] = useState<RutaDonacionMultiparada | null>(null)
  const [rutaDonacionesActivas, setRutaDonacionesActivas] = useState<RutaDonacionMultiparada | null>(null)
  const [rutaDonacionLoading, setRutaDonacionLoading] = useState(false)
  const [cantidad, setCantidad] = useState('')
  const [comentarioDonacion, setComentarioDonacion] = useState('')
  const [vistaDonacion, setVistaDonacion] = useState<VistaDonacion>('objetos')
  const [forzarNuevoFlujoDonacion, setForzarNuevoFlujoDonacion] = useState(false)
  const [wizardMode, setWizardMode] = useState<'create' | 'navigate'>('create')
  const [donacionLoading, setDonacionLoading] = useState(false)
  const [estadoLoadingId, setEstadoLoadingId] = useState('')
  const [mensajeDonacion, setMensajeDonacion] = useState('')
  const [errorDonacion, setErrorDonacion] = useState('')
  const [cantidadError, setCantidadError] = useState('')
  const [codigosEntrega, setCodigosEntrega] = useState<Record<string, string>>({})
  const [mostrarModalEditarDonaciones, setMostrarModalEditarDonaciones] = useState(false)
  const [mostrarConfirmarEntregaManual, setMostrarConfirmarEntregaManual] = useState(false)
  const [mostrarModalQrs, setMostrarModalQrs] = useState(false)
  const [cantidadesEditablesDonacion, setCantidadesEditablesDonacion] = useState<Record<string, string>>({})
  const [iniciarGuiadoActivo, setIniciarGuiadoActivo] = useState(false)
  const [stepsNavegacion, setStepsNavegacion] = useState<StepNavegacion[]>([])
  const [stepActualIdx, setStepActualIdx] = useState(0)
  const [navLoading, setNavLoading] = useState(false)
  const [vozActiva, setVozActiva] = useState(true)
  const [headingDispositivo, setHeadingDispositivo] = useState<number | null>(null)
  const announcementsRef = useRef<Set<string>>(new Set())
  const [actividadManualActiva, setActividadManualActiva] = useState<ActividadManualActiva | null>(null)
  const [ocupacionPorPuesto, setOcupacionPorPuesto] = useState<Record<string, OcupacionPuesto>>({})
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
  const [rutaActiva, setRutaActiva] = useState<{
    puesto: PuestoEmergencia
    donacionId?: string
    points: [number, number][]
    distanciaKm: number
    duracionMin: number
    incidenciasEvitadas: number
    incidenciasCercanas: number
  } | null>(null)
  const [rutaLoading, setRutaLoading] = useState(false)
  const [rutaLoadingId, setRutaLoadingId] = useState('')
  const [rutaErrorDonacionId, setRutaErrorDonacionId] = useState('')
  const [rutaError, setRutaError] = useState('')
  const [rutaPendiente, setRutaPendiente] = useState<{
    puesto: PuestoEmergencia
    donacionId?: string
    excluirIncidenciaId?: string
  } | null>(null)
  const [incidenciaFinalizacion, setIncidenciaFinalizacion] = useState<Incidencia | null>(null)
  const [estadoIncidenciaFinal, setEstadoIncidenciaFinal] = useState<'CORTADA' | 'TRANSITABLE'>('CORTADA')
  const [comentarioIncidenciaFinal, setComentarioIncidenciaFinal] = useState('')
  const [finalizacionIncidenciaError, setFinalizacionIncidenciaError] = useState('')
  const [finalizacionIncidenciaLoading, setFinalizacionIncidenciaLoading] = useState(false)
  const [incidenciaConfirmacion, setIncidenciaConfirmacion] = useState<Incidencia | null>(null)
  const [recomendacionesLeidas, setRecomendacionesLeidas] = useState(false)
  const [ayudaIncidenciaLoadingId, setAyudaIncidenciaLoadingId] = useState('')
  const { position, request: requestGeo } = useGeolocation()
  const { isOnline } = useConnectivity()
  const enqueueSync = useSyncStore((store) => store.enqueue)
  const [realtimeRefresh, setRealtimeRefresh] = useState(0)

  useEffect(() => {
    if (position) setUserPosition([position.lat, position.lng])
  }, [position])

  // Voice navigation logic: text-to-speech
  useEffect(() => {
    if (!iniciarGuiadoActivo || stepsNavegacion.length === 0) return

    const stepObj = stepsNavegacion[stepActualIdx]
    if (!stepObj) return

    const anuncio = `${stepObj.instruccion}. ${stepObj.distanciaM > 10 ? `A ${formatearDistanciaNav(stepObj.distanciaM)}` : ''}`
    if (vozActiva && typeof speechSynthesis !== 'undefined' && !announcementsRef.current.has(anuncio)) {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(stepObj.instruccion)
      utterance.lang = 'es-ES'
      speechSynthesis.speak(utterance)
      announcementsRef.current.add(anuncio)
    }
  }, [iniciarGuiadoActivo, stepActualIdx, stepsNavegacion, vozActiva])

  // Device orientation for compass
  useEffect(() => {
    if (!iniciarGuiadoActivo) return

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading = (event as { webkitCompassHeading?: number }).webkitCompassHeading ?? event.alpha
      if (heading !== null && heading !== undefined) {
        setHeadingDispositivo(360 - heading)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [iniciarGuiadoActivo])

  useEffect(() => {
    const handleRealtimeUpdate = () => setRealtimeRefresh((current) => current + 1)
    window.addEventListener('realtime:update', handleRealtimeUpdate)
    return () => window.removeEventListener('realtime:update', handleRealtimeUpdate)
  }, [])

  useEffect(() => {
    if (!userPosition || !rutaPendiente) return

    const pendiente = rutaPendiente
    setRutaPendiente(null)
    void handleComoLlegar(pendiente.puesto, pendiente.donacionId, pendiente.excluirIncidenciaId)
  }, [rutaPendiente, userPosition])

  const isInitialLoad = useRef(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (isInitialLoad.current) {
        setLoading(true)
      }
      try {
        const [
          { data: puestosData },
          { data: incidenciasData },
          necesidadesResult,
          misDonacionesResult,
          asignacionPuestoResult,
          asignacionIncidenciaResult,
          misAsignacionesPuestoResult,
          misAsignacionesIncidenciaResult,
          solicitudesParticipacionResult,
        ] = await Promise.all([
          apiClient.get('/api/puestos').catch(() => ({ data: { puestos: [] } })),
          apiClient.get('/api/incidencias').catch(() => ({ data: { incidencias: [] } })),
          apiClient.get('/api/donaciones/necesidades').catch(() => ({ data: { necesidades: [] } })),
          apiClient.get('/api/donaciones/mis-donaciones').catch(() => ({ data: { donaciones: [] } })),
          apiClient.get('/api/puestos/mis-asignaciones/activa').catch(() => ({ data: { asignacion: null } })),
          apiClient.get('/api/incidencias/mis-asignaciones/activa').catch(() => ({ data: { asignacion: null } })),
          apiClient.get('/api/puestos/mis-asignaciones').catch(() => ({ data: { asignaciones: [] } })),
          apiClient.get('/api/incidencias/mis-asignaciones').catch(() => ({ data: { asignaciones: [] } })),
          apiClient.get('/api/puestos/mis-solicitudes-participacion').catch(() => ({ data: { solicitudes: [] } })),
        ])

        const apiNecesidades: NecesidadDonacionApi[] = necesidadesResult.data.necesidades ?? []
        const asignacionActiva = asignacionPuestoResult.data.asignacion as AsignacionPuestoActiva | null
        const puestosBase: PuestoEmergencia[] = puestosData.puestos ?? []
        const loadedPuestos: PuestoEmergencia[] = asignacionActiva?.puesto && !puestosBase.some((puesto) => puesto.id === asignacionActiva.puestoId)
          ? [asignacionActiva.puesto, ...puestosBase]
          : puestosBase

        const { data: bulkInventarioData } = await apiClient.get('/api/inventario').catch(() => ({ data: { inventario: [] } }))
        const inventarioItems = bulkInventarioData.inventario ?? []

        const inventarioPorPuestoMap: Record<string, ItemInventario[]> = {}
        loadedPuestos.forEach((puesto) => {
          inventarioPorPuestoMap[puesto.id] = []
        })
        inventarioItems.forEach((item: any) => {
          if (inventarioPorPuestoMap[item.puestoId] !== undefined) {
            inventarioPorPuestoMap[item.puestoId].push(item)
          } else {
            inventarioPorPuestoMap[item.puestoId] = [item]
          }
        })

        if (!cancelled) {
          setPuestos(loadedPuestos)
          setOcupacionPorPuesto((current) => ({
            ...Object.fromEntries(loadedPuestos.map((puesto, index) => [puesto.id, ocupacionInicialPuesto(puesto, index)] as const)),
            ...current,
          }))
          if (asignacionActiva?.puesto) {
            setPuestoActivoAsignado(asignacionActiva.puesto)
            setActividadManualActiva({
              tipo: 'puesto',
              id: asignacionActiva.puestoId,
              nombre: asignacionActiva.puesto.nombre,
            })
          } else {
            setPuestoActivoAsignado(null)
          }
          const asignacionIncidenciaActiva = asignacionIncidenciaResult.data.asignacion as AsignacionIncidenciaActiva | null
          if (asignacionIncidenciaActiva?.incidencia) {
            setActividadManualActiva({
              tipo: 'incidencia',
              id: asignacionIncidenciaActiva.incidenciaId,
              nombre: getIncidenciaTitulo(asignacionIncidenciaActiva.incidencia),
            })
          }
          setInventarioPorPuesto(inventarioPorPuestoMap)
          setIncidencias(incidenciasData.incidencias ?? [])
          setNecesidadesApi(apiNecesidades.map((necesidad: NecesidadDonacionApi) => ({
            puesto: necesidad.puesto,
            item: {
              id: necesidad.id,
              puestoId: necesidad.puesto.id,
              producto: necesidad.producto,
              cantidad: necesidad.cantidadPendiente,
              tipo: 'necesario',
              nivelStock: necesidad.prioridad === 'alta' ? 'critico' : 'bajo',
              updatedAt: necesidad.updatedAt,
            },
            cantidadNecesaria: necesidad.cantidadNecesaria,
            cantidadComprometida: necesidad.cantidadComprometida,
            cantidadPendiente: necesidad.cantidadPendiente,
            prioridad: necesidad.prioridad,
          })))
          setMisDonaciones(misDonacionesResult.data.donaciones ?? [])
          setMisAsignacionesPuesto(misAsignacionesPuestoResult.data.asignaciones ?? [])
          setMisAsignacionesIncidencia(misAsignacionesIncidenciaResult.data.asignaciones ?? [])
          setMisSolicitudesParticipacion(solicitudesParticipacionResult.data.solicitudes ?? [])
        }
      } catch {
        if (!cancelled) {
          setPuestos([])
          setOcupacionPorPuesto({})
          setInventarioPorPuesto({})
          setIncidencias([])
          setMisAsignacionesPuesto([])
          setMisAsignacionesIncidencia([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          isInitialLoad.current = false
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [realtimeRefresh])

  useEffect(() => {
    const donacionesConCodigo = Object.keys(codigosEntrega)
    if (donacionesConCodigo.length === 0) return

    let cancelled = false
    const checkDonacionesEntregadas = async () => {
      try {
        const { data } = await apiClient.get('/api/donaciones/mis-donaciones')
        if (cancelled) return

        const donacionesActualizadas = (data.donaciones ?? []) as Donacion[]
        const idsCerradas = new Set(
          donacionesActualizadas
            .filter((donacion) => donacion.estado === 'ENTREGADA' || donacion.estado === 'CANCELADA')
            .map((donacion) => donacion.id),
        )

        setMisDonaciones(donacionesActualizadas)
        setCodigosEntrega((current) => {
          const next = { ...current }
          let changed = false
          for (const donacionId of Object.keys(next)) {
            if (idsCerradas.has(donacionId)) {
              delete next[donacionId]
              changed = true
            }
          }
          return changed ? next : current
        })

        if (donacionesConCodigo.some((donacionId) => idsCerradas.has(donacionId))) {
          setMensajeDonacion('Donacion cerrada por el puesto.')
        }
      } catch {
        // La pantalla seguira mostrando el QR; se reintenta en la siguiente comprobacion.
      }
    }

    void checkDonacionesEntregadas()
    const intervalId = window.setInterval(() => void checkDonacionesEntregadas(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [codigosEntrega])

  const necesidades = useMemo<Necesidad[]>(() => (
    necesidadesApi.length > 0 ? necesidadesApi.filter((necesidad) => necesidad.item.cantidad > 0) :
    puestos.flatMap((puesto) => (
      (inventarioPorPuesto[puesto.id] ?? [])
        .filter((item) => item.tipo === 'necesario')
        .map((item) => ({ puesto, item }))
    ))
  ), [inventarioPorPuesto, necesidadesApi, puestos])

  const objetosDonables = useMemo<ObjetoDonable[]>(() => {
    const grouped = new globalThis.Map<string, ObjetoDonable>()

    necesidades.forEach((necesidad) => {
      const key = productoDonableKey(necesidad.item.producto)
      const current = grouped.get(key)
      const cantidad = necesidad.cantidadPendiente ?? necesidad.item.cantidad

      if (current) {
        current.necesidades.push(necesidad)
        current.cantidadTotal += cantidad
      } else {
        grouped.set(key, {
          key,
          producto: necesidad.item.producto,
          necesidades: [necesidad],
          cantidadTotal: cantidad,
        })
      }
    })

    return Array.from(grouped.values())
      .map((objeto) => ({
        ...objeto,
        necesidades: userPosition
          ? sortByDistance(objeto.necesidades.map((necesidad) => ({
              ...necesidad,
              latitud: necesidad.puesto.latitud,
              longitud: necesidad.puesto.longitud,
            })), userPosition[0], userPosition[1])
          : [...objeto.necesidades].sort((a, b) => (
              (b.cantidadPendiente ?? b.item.cantidad) - (a.cantidadPendiente ?? a.item.cantidad)
            )),
      }))
      .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
  }, [necesidades, userPosition])

  /*
  const donacionesSeleccionadas = useMemo(() => (
    objetosDonables.flatMap((objeto) => {
      const seleccionObjeto = seleccionObjetosDonacion[objeto.key]
      if (!seleccionObjeto) return []

      const necesidad = objeto.necesidades.find((item) => item.puesto.id === seleccionObjeto.puestoId) ?? objeto.necesidades[0]
      if (!necesidad) return []

      return [{ objeto, necesidad, cantidad: seleccionObjeto.cantidad }]
    })
  ), [objetosDonables, seleccionObjetosDonacion])

  const puestosRutaDonacion = useMemo(() => {
    const byId = new globalThis.Map<string, PuestoEmergencia>()
    donacionesSeleccionadas.forEach(({ necesidad }) => byId.set(necesidad.puesto.id, necesidad.puesto))
    const selectedPuestos = Array.from(byId.values())
    return userPosition ? sortByDistance(selectedPuestos, userPosition[0], userPosition[1]) : selectedPuestos
  }, [donacionesSeleccionadas, userPosition])
  */

  const selectedNeed = necesidades.find((necesidad) => necesidad.item.id === seleccion)
  const donacionesActivas = misDonaciones.filter(isDonacionActiva)
  const paradasDonacionesActivas = useMemo(() => {
    const byPuesto = new globalThis.Map<string, { puesto: PuestoEmergencia; donaciones: Donacion[] }>()

    donacionesActivas.forEach((donacion) => {
      const current = byPuesto.get(donacion.puesto.id)
      if (current) {
        current.donaciones.push(donacion)
      } else {
        byPuesto.set(donacion.puesto.id, { puesto: donacion.puesto, donaciones: [donacion] })
      }
    })

    const paradas: Array<{ puesto: PuestoEmergencia; donaciones: Donacion[]; distanciaKm?: number }> = Array.from(byPuesto.values())
    return userPosition
      ? sortByDistance(paradas.map((parada) => ({
          ...parada,
          latitud: parada.puesto.latitud,
          longitud: parada.puesto.longitud,
        })), userPosition[0], userPosition[1])
      : paradas
  }, [donacionesActivas, userPosition])
  const donacionesHistorial = misDonaciones.filter((donacion) => !isDonacionActiva(donacion))
  const historialPuestos = misAsignacionesPuesto.filter((asignacion) => asignacion.estado !== 'ACTIVA')
  const historialIncidencias = misAsignacionesIncidencia.filter((asignacion) => asignacion.estado !== 'ACTIVA')
  const solicitudesParticipacionPorPuesto = useMemo(() => {
    const byPuesto = new globalThis.Map<string, SolicitudParticipacionPuesto>()
    misSolicitudesParticipacion.forEach((solicitud) => {
      if (!byPuesto.has(solicitud.puestoId)) byPuesto.set(solicitud.puestoId, solicitud)
    })
    return byPuesto
  }, [misSolicitudesParticipacion])
  const incidenciasCortadas = useMemo(() => {
    const cortadas = incidencias.filter((incidencia) => incidencia.estado === 'CORTADA')
    return userPosition ? sortByDistance(cortadas, userPosition[0], userPosition[1]) : cortadas
  }, [incidencias, userPosition])
  const donacionActiva = donacionesActivas[0]
  const actividadActiva = donacionActiva
    ? {
        tipo: 'donacion' as const,
        id: donacionActiva.id,
        nombre: `${donacionActiva.producto.nombre} para ${donacionActiva.puesto.nombre}`,
      }
    : actividadManualActiva
  const estaGestionandoPuesto = actividadActiva?.tipo === 'puesto'

  const resetSelection = (next: AccionVoluntario) => {
    if (actividadActiva && actividadActiva.tipo !== next) return
    setAccion(next)
    setSeleccion('')
    setCantidad('')
    setComentarioDonacion('')
    setMensajeDonacion('')
    setErrorDonacion('')
    setCantidadError('')
    _setRutaDonacionPlan(null)
    if (next === 'donacion') setVistaDonacion('objetos')
  }

  useEffect(() => {
    if (!actividadActiva) return
    setAccion((current) => (current === actividadActiva.tipo ? current : actividadActiva.tipo))
  }, [actividadActiva?.id, actividadActiva?.tipo])

  useEffect(() => {
    if (!donacionActiva) return
    setAccion('donacion')
    setVistaDonacion('mis-donaciones')
  }, [donacionActiva?.id])

  // Automatically calculate active stop route and load map by default
  useEffect(() => {
    if (paradasDonacionesActivas.length > 0 && !rutaDonacionesActivas && !rutaDonacionLoading) {
      if (userPosition) {
        void calcularRutaDonacionesActivas()
      } else {
        requestGeo()
      }
    }
  }, [paradasDonacionesActivas, rutaDonacionesActivas, userPosition, rutaDonacionLoading])

  const volverASelector = () => {
    if (actividadActiva) return
    setAccion(null)
    setSeleccion('')
    setCantidad('')
    setComentarioDonacion('')
    setMensajeDonacion('')
    setErrorDonacion('')
    setCantidadError('')
    setRutaActiva(null)
    setRutaError('')
  }

  const abrirFinalizacionIncidencia = (incidencia: Incidencia) => {
    setIncidenciaFinalizacion(incidencia)
    setEstadoIncidenciaFinal(incidencia.estado)
    setComentarioIncidenciaFinal('')
    setFinalizacionIncidenciaError('')
  }

  const cerrarFinalizacionIncidencia = () => {
    if (finalizacionIncidenciaLoading) return
    setIncidenciaFinalizacion(null)
    setComentarioIncidenciaFinal('')
    setFinalizacionIncidenciaError('')
  }

  const abrirConfirmacionAyudaIncidencia = (incidencia: Incidencia) => {
    if (actividadActiva) return
    setIncidenciaConfirmacion(incidencia)
    setRecomendacionesLeidas(false)
    setErrorDonacion('')
  }

  const cerrarConfirmacionAyudaIncidencia = () => {
    if (ayudaIncidenciaLoadingId) return
    setIncidenciaConfirmacion(null)
    setRecomendacionesLeidas(false)
  }

  const iniciarAyudaPuesto = async (puesto: PuestoEmergencia) => {
    const ocupacion = ocupacionPorPuesto[puesto.id] ?? ocupacionInicialPuesto(puesto, 0)
    if (ocupacion.trabajando >= ocupacion.capacidad || actividadActiva) return

    setErrorDonacion('')
    try {
      if (!isOnline) {
        await enqueueSync({
          entity: 'solicitud-participacion-puesto',
          method: 'POST',
          url: `/api/puestos/${puesto.id}/participaciones`,
          priority: 'high',
        })
      }

      if (isOnline) {
        const { data } = await apiClient.post(`/api/puestos/${puesto.id}/participaciones`)
        if (data.solicitud) {
          setMisSolicitudesParticipacion((current) => [
            data.solicitud,
            ...current.filter((item) => item.id !== data.solicitud.id && item.puestoId !== data.solicitud.puestoId),
          ])
        }
      }

      setMensajeDonacion(
        isOnline
          ? `Solicitud enviada a ${puesto.nombre}. El responsable debe aceptarla para que puedas entrar al equipo.`
          : 'Sin conexion: solicitud de participacion guardada para sincronizar.',
      )
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo enviar la solicitud al puesto.')
    }
  }

  const finalizarAyudaManual = async () => {
    setErrorDonacion('')
    if (actividadManualActiva?.tipo === 'puesto') {
      try {
        if (isOnline) {
          const { data } = await apiClient.post(`/api/puestos/${actividadManualActiva.id}/asignaciones/finalizar`)
          if (data.asignacion) {
            setMisAsignacionesPuesto((current) => [data.asignacion, ...current.filter((item) => item.id !== data.asignacion.id)])
          }
        } else {
          await enqueueSync({
            entity: 'asignacion-puesto',
            method: 'POST',
            url: `/api/puestos/${actividadManualActiva.id}/asignaciones/finalizar`,
            priority: 'high',
          })
          setMensajeDonacion('Sin conexion: finalizacion guardada para sincronizar.')
        }
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : undefined
        setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo finalizar la ayuda en el puesto.')
        return
      }

      setOcupacionPorPuesto((current) => {
        const ocupacion = current[actividadManualActiva.id]
        if (!ocupacion) return current

        return {
          ...current,
          [actividadManualActiva.id]: {
            ...ocupacion,
            trabajando: Math.max(ocupacion.trabajando - 1, 0),
          },
        }
      })
    } else if (actividadManualActiva?.tipo === 'incidencia') {
      const incidencia = incidencias.find((item) => item.id === actividadManualActiva.id)
      if (incidencia) abrirFinalizacionIncidencia(incidencia)
      return
    }
    setActividadManualActiva(null)
    setPuestoActivoAsignado(null)
  }

  const finalizarAyudaIncidenciaConActualizacion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!incidenciaFinalizacion || !actividadManualActiva || actividadManualActiva.tipo !== 'incidencia') return

    const comentario = comentarioIncidenciaFinal.trim()
    if (!comentario) {
      setFinalizacionIncidenciaError('Describe el estado actual de la calle antes de terminar la ayuda.')
      return
    }

    setFinalizacionIncidenciaLoading(true)
    setFinalizacionIncidenciaError('')
    setErrorDonacion('')

    try {
      if (!isOnline) {
        await enqueueSync({
          entity: 'comentario-incidencia',
          method: 'POST',
          url: `/api/incidencias/${incidenciaFinalizacion.id}/comentarios`,
          body: {
            estado: estadoIncidenciaFinal,
            comentario,
          },
          priority: 'high',
        })
        await enqueueSync({
          entity: 'asignacion-incidencia',
          method: 'POST',
          url: `/api/incidencias/${incidenciaFinalizacion.id}/asignaciones/finalizar`,
          priority: 'high',
        })

        setIncidencias((current) => current.map((incidencia) => (
          incidencia.id === incidenciaFinalizacion.id
            ? { ...incidencia, estado: estadoIncidenciaFinal }
            : incidencia
        )))
        setMensajeDonacion('Sin conexion: actualizacion y finalizacion guardadas para sincronizar.')
      } else {
        const { data: comentarioData } = await apiClient.post(`/api/incidencias/${incidenciaFinalizacion.id}/comentarios`, {
          estado: estadoIncidenciaFinal,
          comentario,
        })
        setIncidencias((current) => current.map((incidencia) => (
          incidencia.id === incidenciaFinalizacion.id
            ? { ...incidencia, ...(comentarioData.incidencia ?? {}), distanciaKm: incidencia.distanciaKm }
            : incidencia
        )))

        const { data } = await apiClient.post(`/api/incidencias/${incidenciaFinalizacion.id}/asignaciones/finalizar`)
        if (data.asignacion) {
          setMisAsignacionesIncidencia((current) => [data.asignacion, ...current.filter((item) => item.id !== data.asignacion.id)])
        }
        setMensajeDonacion('Incidencia actualizada y ayuda finalizada correctamente.')
      }

      setActividadManualActiva(null)
      setIncidenciaFinalizacion(null)
      setComentarioIncidenciaFinal('')
      setSeleccion('')
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setFinalizacionIncidenciaError(message?.error ?? message?.message ?? 'No se pudo actualizar la incidencia y finalizar la ayuda.')
    } finally {
      setFinalizacionIncidenciaLoading(false)
    }
  }

  const iniciarAyudaIncidencia = async (incidencia: Incidencia) => {
    if (actividadActiva) return

    setErrorDonacion('')
    setAyudaIncidenciaLoadingId(incidencia.id)
    try {
      if (!isOnline) {
        await enqueueSync({
          entity: 'asignacion-incidencia',
          method: 'POST',
          url: `/api/incidencias/${incidencia.id}/asignaciones`,
          priority: 'high',
        })
      } else {
        await apiClient.post(`/api/incidencias/${incidencia.id}/asignaciones`)
      }

      setActividadManualActiva({
        tipo: 'incidencia',
        id: incidencia.id,
        nombre: getIncidenciaTitulo(incidencia),
      })
      setIncidenciaConfirmacion(null)
      setRecomendacionesLeidas(false)
      if (!isOnline) setMensajeDonacion('Sin conexion: asignacion a incidencia guardada para sincronizar.')
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo reservar la ayuda en la incidencia.')
    } finally {
      setAyudaIncidenciaLoadingId('')
    }
  }

  const handleComoLlegar = async (puesto: PuestoEmergencia, donacionId?: string, excluirIncidenciaId?: string) => {
    setRutaError('')
    setRutaErrorDonacionId('')

    if (!userPosition) {
      setRutaPendiente({ puesto, donacionId, excluirIncidenciaId })
      requestGeo()
      setRutaError('Comparte tu ubicacion y calcularemos la ruta automaticamente.')
      setRutaErrorDonacionId(donacionId ?? puesto.id)
      return
    }

    setRutaLoading(true)
    setRutaLoadingId(donacionId ?? puesto.id)
    try {
      const incidenciasRuta = excluirIncidenciaId
        ? incidencias.filter((incidencia) => incidencia.id !== excluirIncidenciaId)
        : incidencias
      const resultado = await fetchRutaEvitandoIncidencias(
        userPosition,
        [puesto.latitud, puesto.longitud],
        incidenciasRuta,
      )
      setRutaActiva({ puesto, donacionId, ...resultado })
    } catch (error) {
      setRutaError(error instanceof Error ? error.message : 'No se pudo calcular la ruta.')
      setRutaErrorDonacionId(donacionId ?? puesto.id)
    } finally {
      setRutaLoading(false)
      setRutaLoadingId('')
    }
  }

  const handleComoLlegarIncidencia = (incidencia: Incidencia) => {
    const destinoIncidencia: PuestoEmergencia = {
      id: `incidencia-${incidencia.id}`,
      nombre: incidencia.descripcion || 'Incidencia',
      direccion: `${incidencia.latitud.toFixed(5)}, ${incidencia.longitud.toFixed(5)}`,
      latitud: incidencia.latitud,
      longitud: incidencia.longitud,
      tipo: incidencia.estado === 'CORTADA' ? 'Incidencia cortada' : 'Incidencia transitable',
      activo: true,
    }

    void handleComoLlegar(destinoIncidencia, `incidencia:${incidencia.id}`, incidencia.id)
  }

  const puestoRutaMarker: PuestoMarker[] = rutaActiva
    ? [{
        id: rutaActiva.puesto.id,
        nombre: rutaActiva.puesto.nombre,
        direccion: rutaActiva.puesto.direccion,
        latitud: rutaActiva.puesto.latitud,
        longitud: rutaActiva.puesto.longitud,
        necesidades: 0,
      }]
    : []

  const cargarInventarioPuestoActivo = async (puestoId: string) => {
    setInventarioPuestoActivoLoading(true)
    setInventarioPuestoError('')
    try {
      const { data } = await apiClient.get(`/api/inventario/puesto/${puestoId}`)
      setInventarioPuestoActivo(data.inventario ?? [])
    } catch {
      setInventarioPuestoActivo([])
      setInventarioPuestoError('No se pudo cargar el inventario del puesto.')
    } finally {
      setInventarioPuestoActivoLoading(false)
    }
  }

  const publicarNecesidadPuestoActivo = async (puestoId: string, item: ItemInventario, cantidad: number) => {
    await apiClient.post(`/api/inventario/puesto/${puestoId}/items`, {
      nombre: item.producto.nombre,
      categoria: item.producto.categoria,
      unidad: item.producto.unidad,
      cantidad,
      tipo: 'NECESARIO',
    })
  }

  const crearItemDesdeBasico = async (puestoId: string, item: ItemInventario, cantidad: number, tipo: 'DISPONIBLE' | 'NECESARIO') => {
    await apiClient.post(`/api/inventario/puesto/${puestoId}/items`, {
      nombre: item.producto.nombre,
      categoria: item.producto.categoria,
      unidad: item.producto.unidad,
      cantidad,
      tipo,
    })
  }

  const actualizarDisponiblePuestoActivo = async (item: ItemInventario, cantidadDisponible: number) => {
    await apiClient.patch(`/api/inventario/items/${item.id}/cantidad`, {
      cantidad: Math.max(cantidadDisponible, 0),
    })
  }

  const ajustarNecesidadPuestoActivo = async (item: ItemInventario, cantidadNecesaria: number) => {
    await apiClient.patch(`/api/inventario/items/${item.id}/cantidad`, {
      cantidad: Math.max(cantidadNecesaria, 0),
    })
  }

  const guardarDisponiblePuestoActivo = async (
    puestoId: string,
    card: InventarioPuestoCard,
    cantidadDisponible: number,
  ) => {
    const baseItem = card.disponible ?? card.necesario ?? card.virtual
    const cantidad = Math.max(cantidadDisponible, 0)

    if (card.disponible && !isInventarioVirtual(card.disponible)) {
      await actualizarDisponiblePuestoActivo(card.disponible, cantidad)
    } else if (baseItem && cantidad > 0) {
      await crearItemDesdeBasico(puestoId, baseItem, cantidad, 'DISPONIBLE')
    }
  }

  const guardarNecesidadPuestoActivo = async (
    puestoId: string,
    card: InventarioPuestoCard,
    cantidadNecesaria: number,
  ) => {
    const baseItem = card.disponible ?? card.necesario ?? card.virtual
    const cantidad = Math.max(cantidadNecesaria, 0)

    if (card.necesario && !isInventarioVirtual(card.necesario)) {
      await ajustarNecesidadPuestoActivo(card.necesario, cantidad)
    } else if (baseItem && cantidad > 0) {
      await publicarNecesidadPuestoActivo(puestoId, baseItem, cantidad)
    }
  }

  const registrarLlegadaPuestoActivo = async (
    puestoId: string,
    card: InventarioPuestoCard,
    cantidadRecibida: number,
  ) => {
    if (cantidadRecibida <= 0) return

    const cubierto = Math.min(card.cantidadNecesaria, cantidadRecibida)
    const nuevaCantidadNecesaria = Math.max(card.cantidadNecesaria - cubierto, 0)
    const sobrante = Math.max(cantidadRecibida - card.cantidadNecesaria, 0)
    const nuevaCantidadDisponible = card.cantidadDisponible + sobrante

    if (card.cantidadNecesaria > 0) {
      await guardarNecesidadPuestoActivo(puestoId, card, nuevaCantidadNecesaria)
    }
    if (sobrante > 0 || card.cantidadNecesaria <= 0) {
      await guardarDisponiblePuestoActivo(puestoId, card, nuevaCantidadDisponible)
    }
  }

  const registrarSalidaONecesidadPuestoActivo = async (
    puestoId: string,
    card: InventarioPuestoCard,
    cantidadSolicitada: number,
  ) => {
    if (cantidadSolicitada <= 0) return

    const cubierto = Math.min(card.cantidadDisponible, cantidadSolicitada)
    const nuevaCantidadDisponible = Math.max(card.cantidadDisponible - cubierto, 0)
    const faltante = Math.max(cantidadSolicitada - card.cantidadDisponible, 0)
    const nuevaCantidadNecesaria = card.cantidadNecesaria + faltante

    if (card.cantidadDisponible > 0) {
      await guardarDisponiblePuestoActivo(puestoId, card, nuevaCantidadDisponible)
    }
    if (faltante > 0 || card.cantidadDisponible <= 0) {
      await guardarNecesidadPuestoActivo(puestoId, card, nuevaCantidadNecesaria)
    }
  }

  const aplicarOperacionInventarioPuesto = async (
    card: InventarioPuestoCard,
    operacion: OperacionInventarioPuesto,
    cantidad: number,
  ) => {
    const puestoId = actividadManualActiva?.tipo === 'puesto' ? actividadManualActiva.id : ''
    if (!puestoId) return
    setInventarioPuestoError('')
    try {
      const baseItem = card.disponible ?? card.necesario ?? card.virtual
      if (!baseItem) return

      if (operacion === 'necesidad') {
        await registrarSalidaONecesidadPuestoActivo(puestoId, card, cantidad)
      } else if (operacion === 'entrada') {
        await registrarLlegadaPuestoActivo(puestoId, card, cantidad)
      } else if (operacion === 'salida') {
        await registrarSalidaONecesidadPuestoActivo(puestoId, card, cantidad)
      } else if (card.estado === 'necesario') {
        if (card.necesario && !isInventarioVirtual(card.necesario)) {
          await ajustarNecesidadPuestoActivo(card.necesario, cantidad)
        } else if (cantidad > 0) {
          await publicarNecesidadPuestoActivo(puestoId, baseItem, cantidad)
        }
      } else if (card.disponible && !isInventarioVirtual(card.disponible)) {
        await actualizarDisponiblePuestoActivo(card.disponible, cantidad)
      } else if (cantidad > 0) {
        await crearItemDesdeBasico(puestoId, baseItem, cantidad, 'DISPONIBLE')
      }
      await cargarInventarioPuestoActivo(puestoId)
      await queryClient.invalidateQueries({ queryKey: ['inventario-ciudadano-busqueda'] })
    } catch (err: unknown) {
      setInventarioPuestoError(err instanceof Error ? err.message : 'No se pudo actualizar la cantidad.')
      throw err
    }
  }

  const ajustarInventarioPuestoActivo = async (
    card: InventarioPuestoCard,
    cantidadDisponible: number,
    cantidadNecesaria: number,
  ) => {
    const puestoId = actividadManualActiva?.tipo === 'puesto' ? actividadManualActiva.id : ''
    if (!puestoId) return
    setInventarioPuestoError('')
    try {
      if (cantidadDisponible > 0 && cantidadNecesaria > 0) {
        throw new Error('No puedes guardar stock disponible y necesidad a la vez. Deja una de las dos cantidades a 0.')
      }

      const baseItem = card.disponible ?? card.necesario ?? card.virtual
      if (!baseItem) return

      if (card.disponible && !isInventarioVirtual(card.disponible)) {
        await actualizarDisponiblePuestoActivo(card.disponible, cantidadDisponible)
      } else if (cantidadDisponible > 0) {
        await crearItemDesdeBasico(puestoId, baseItem, cantidadDisponible, 'DISPONIBLE')
      }

      if (card.necesario && !isInventarioVirtual(card.necesario)) {
        await ajustarNecesidadPuestoActivo(card.necesario, cantidadNecesaria)
      } else if (cantidadNecesaria > 0) {
        await publicarNecesidadPuestoActivo(puestoId, baseItem, cantidadNecesaria)
      }

      await cargarInventarioPuestoActivo(puestoId)
      await queryClient.invalidateQueries({ queryKey: ['inventario-ciudadano-busqueda'] })
    } catch (err: unknown) {
      setInventarioPuestoError(err instanceof Error ? err.message : 'No se pudo ajustar el inventario.')
      throw err
    }
  }

  const eliminarProductoInventarioPuesto = async (card: InventarioPuestoCard) => {
    if (card.isBasico) return
    const puestoId = actividadManualActiva?.tipo === 'puesto' ? actividadManualActiva.id : ''
    if (!puestoId) return
    const confirmed = window.confirm(`Eliminar ${card.producto.nombre} del inventario?`)
    if (!confirmed) return

    setInventarioPuestoError('')
    try {
      const deletions = [card.disponible, card.necesario]
        .filter((item): item is ItemInventario => Boolean(item && !isInventarioVirtual(item)))
        .map((item) => apiClient.delete(`/api/inventario/items/${item.id}`))
      await Promise.all(deletions)
      await cargarInventarioPuestoActivo(puestoId)
      await queryClient.invalidateQueries({ queryKey: ['inventario-ciudadano-busqueda'] })
    } catch {
      setInventarioPuestoError('No se pudo eliminar el producto.')
    }
  }

  const crearItemInventarioPuestoActivo = async (input: {
    nombre: string
    categoria: string
    unidad: string
    cantidad: number
    tipo: 'DISPONIBLE' | 'NECESARIO'
  }) => {
    const puestoId = actividadManualActiva?.tipo === 'puesto' ? actividadManualActiva.id : ''
    if (!puestoId) return
    setInventarioPuestoError('')
    await apiClient.post(`/api/inventario/puesto/${puestoId}/items`, input)
    await cargarInventarioPuestoActivo(puestoId)
    await queryClient.invalidateQueries({ queryKey: ['inventario-ciudadano-busqueda'] })
  }

  useEffect(() => {
    if (actividadManualActiva?.tipo !== 'puesto') {
      setInventarioPuestoActivo([])
      return
    }
    void cargarInventarioPuestoActivo(actividadManualActiva.id)
  }, [actividadManualActiva?.id, actividadManualActiva?.tipo])

  /*
  const _toggleObjetoDonacion = (objeto: ObjetoDonable) => {
    setSeleccionObjetosDonacion((current) => {
      if (current[objeto.key]) {
        const next = { ...current }
        delete next[objeto.key]
        return next
      }

      const necesidadSugerida = objeto.necesidades[0]
      if (!necesidadSugerida) return current

      return {
        ...current,
        [objeto.key]: {
          cantidad: '1',
          puestoId: necesidadSugerida.puesto.id,
        },
      }
    })
    _setRutaDonacionPlan(null)
    setErrorDonacion('')
    setMensajeDonacion('')
  }

  const _updateObjetoDonacion = (key: string, patch: Partial<SeleccionObjetoDonacion>) => {
    setSeleccionObjetosDonacion((current) => {
      const selected = current[key]
      if (!selected) return current
      return { ...current, [key]: { ...selected, ...patch } }
    })
    _setRutaDonacionPlan(null)
    setErrorDonacion('')
  }
  */

  /*
  const calcularRutaDonacionesSeleccionadas = async () => {
    setErrorDonacion('')
    setRutaError('')

    if (donacionesSeleccionadas.length === 0) {
      setErrorDonacion('Selecciona al menos un objeto para calcular la ruta.')
      return
    }

    if (!userPosition) {
      requestGeo()
      setErrorDonacion('Comparte tu ubicacion para calcular la ruta de entrega.')
      return
    }

    setRutaDonacionLoading(true)
    try {
      const allPoints: [number, number][] = []
      let desde = userPosition
      let distanciaKm = 0
      let duracionMin = 0
      let incidenciasEvitadas = 0
      let incidenciasCercanas = 0

      for (const puesto of puestosRutaDonacion) {
        const resultado = await fetchRutaEvitandoIncidencias(
          desde,
          [puesto.latitud, puesto.longitud],
          incidencias,
        )
        allPoints.push(...(allPoints.length > 0 ? resultado.points.slice(1) : resultado.points))
        distanciaKm += resultado.distanciaKm
        duracionMin += resultado.duracionMin
        incidenciasEvitadas += resultado.incidenciasEvitadas
        incidenciasCercanas += resultado.incidenciasCercanas
        desde = [puesto.latitud, puesto.longitud]
      }

      setRutaDonacionPlan({
        puestos: puestosRutaDonacion,
        points: allPoints,
        distanciaKm,
        duracionMin,
        incidenciasEvitadas,
        incidenciasCercanas,
      })
    } catch (error) {
      setErrorDonacion(error instanceof Error ? error.message : 'No se pudo calcular la ruta de entrega.')
    } finally {
      setRutaDonacionLoading(false)
    }
  }
  */

  const calcularRutaDonacionesActivas = async () => {
    setErrorDonacion('')
    setRutaError('')

    if (paradasDonacionesActivas.length === 0) {
      setErrorDonacion('No hay donaciones activas para calcular una ruta.')
      return
    }

    if (!userPosition) {
      requestGeo()
      setErrorDonacion('Comparte tu ubicacion para calcular la ruta completa de entrega.')
      return
    }

    setRutaDonacionLoading(true)
    try {
      const allPoints: [number, number][] = []
      let desde = userPosition
      let distanciaKm = 0
      let duracionMin = 0
      let incidenciasEvitadas = 0
      let incidenciasCercanas = 0

      for (const parada of paradasDonacionesActivas) {
        const resultado = await fetchRutaEvitandoIncidencias(
          desde,
          [parada.puesto.latitud, parada.puesto.longitud],
          incidencias,
        )
        allPoints.push(...(allPoints.length > 0 ? resultado.points.slice(1) : resultado.points))
        distanciaKm += resultado.distanciaKm
        duracionMin += resultado.duracionMin
        incidenciasEvitadas += resultado.incidenciasEvitadas
        incidenciasCercanas += resultado.incidenciasCercanas
        desde = [parada.puesto.latitud, parada.puesto.longitud]
      }

      setRutaDonacionesActivas({
        puestos: paradasDonacionesActivas.map((parada) => parada.puesto),
        points: allPoints,
        distanciaKm,
        duracionMin,
        incidenciasEvitadas,
        incidenciasCercanas,
      })
    } catch (error) {
      setErrorDonacion(error instanceof Error ? error.message : 'No se pudo calcular la ruta completa de entrega.')
    } finally {
      setRutaDonacionLoading(false)
    }
  }

  /*
  const handleCrearDonacionesSeleccionadas = async () => {
    if (donacionesSeleccionadas.length === 0) {
      setErrorDonacion('Selecciona al menos un objeto para donar.')
      return
    }

    setDonacionLoading(true)
    setErrorDonacion('')
    setMensajeDonacion('')

    try {
      const nuevasDonaciones: Donacion[] = []

      for (const { necesidad, cantidad: cantidadSeleccionada } of donacionesSeleccionadas) {
        const parsedCantidad = Number(cantidadSeleccionada.replace(',', '.'))
        const cantidadMaxima = necesidad.cantidadPendiente ?? necesidad.item.cantidad

        if (!Number.isFinite(parsedCantidad) || parsedCantidad <= 0 || !Number.isInteger(parsedCantidad)) {
          throw new Error(`Introduce una cantidad valida para ${necesidad.item.producto.nombre}.`)
        }
        if (parsedCantidad > cantidadMaxima) {
          throw new Error(`No puedes comprometer mas de ${cantidadMaxima} ${necesidad.item.producto.unidad} de ${necesidad.item.producto.nombre}.`)
        }

        const body = {
          puestoId: necesidad.puesto.id,
          productoId: necesidad.item.producto.id,
          cantidad: parsedCantidad,
          unidad: necesidad.item.producto.unidad,
          comentario: comentarioDonacion || undefined,
        }

        if (!isOnline) {
          const donacionOffline: Donacion = {
            id: `offline-${crypto.randomUUID()}`,
            cantidad: parsedCantidad,
            unidad: necesidad.item.producto.unidad,
            estado: 'PENDIENTE',
            comentario: comentarioDonacion || undefined,
            producto: necesidad.item.producto,
            puesto: necesidad.puesto,
          }

          await enqueueSync({
            entity: 'donacion',
            method: 'POST',
            url: '/api/donaciones',
            body,
            priority: 'high',
          })
          nuevasDonaciones.push(donacionOffline)
        } else {
          const { data } = await apiClient.post('/api/donaciones', body)
          nuevasDonaciones.push(data.donacion)
        }
      }

      setMisDonaciones((current) => [...nuevasDonaciones, ...current])
      setSeleccionObjetosDonacion({})
      setRutaDonacionPlan(null)
      setComentarioDonacion('')
      setVistaDonacion('mis-donaciones')
      setMensajeDonacion(isOnline
        ? 'Donaciones registradas correctamente. La ruta queda organizada por puestos.'
        : 'Sin conexion: donaciones guardadas y pendientes de sincronizar.')
    } catch (err: unknown) {
      setErrorDonacion(getApiErrorMessage(err, 'No se pudieron registrar las donaciones.'))
    } finally {
      setDonacionLoading(false)
    }
  }
  */

  /*
  const handleCrearDonacion = async () => {
    if (!selectedNeed) return

    setCantidadError('')
    setErrorDonacion('')

    if (!cantidad.trim()) {
      setCantidadError('Indica la cantidad que puedes llevar.')
      return
    }

    const parsedCantidad = Number(cantidad.replace(',', '.'))
    if (!Number.isFinite(parsedCantidad) || parsedCantidad <= 0) {
      setCantidadError('Introduce una cantidad valida mayor que 0.')
      return
    }

    if (!Number.isInteger(parsedCantidad)) {
      setCantidadError('La cantidad tiene que ser un numero entero.')
      return
    }

    const cantidadMaxima = selectedNeed.cantidadPendiente ?? selectedNeed.item.cantidad
    if (parsedCantidad > cantidadMaxima) {
      setCantidadError(`No puedes comprometer mas de ${cantidadMaxima} ${selectedNeed.item.producto.unidad}.`)
      return
    }

    setDonacionLoading(true)
    setMensajeDonacion('')

    try {
      if (!isOnline) {
        const donacionOffline: Donacion = {
          id: `offline-${crypto.randomUUID()}`,
          cantidad: parsedCantidad,
          unidad: selectedNeed.item.producto.unidad,
          estado: 'PENDIENTE',
          comentario: comentarioDonacion || undefined,
          producto: selectedNeed.item.producto,
          puesto: selectedNeed.puesto,
        }

        await enqueueSync({
          entity: 'donacion',
          method: 'POST',
          url: '/api/donaciones',
          body: {
            puestoId: selectedNeed.puesto.id,
            productoId: selectedNeed.item.producto.id,
            cantidad: parsedCantidad,
            unidad: selectedNeed.item.producto.unidad,
            comentario: comentarioDonacion || undefined,
          },
          priority: 'high',
        })

        setMisDonaciones((current) => [donacionOffline, ...current])
        setMensajeDonacion('Sin conexion: donacion guardada y pendiente de sincronizar.')
        setVistaDonacion('mis-donaciones')
        setCantidad('')
        setComentarioDonacion('')
        setSeleccion('')
        return
      }

      const { data } = await apiClient.post('/api/donaciones', {
        puestoId: selectedNeed.puesto.id,
        productoId: selectedNeed.item.producto.id,
        cantidad: parsedCantidad,
        unidad: selectedNeed.item.producto.unidad,
        comentario: comentarioDonacion || undefined,
      })

      setMisDonaciones((current) => [data.donacion, ...current])
      setNecesidadesApi((current) => current.map((necesidad) => {
        if (necesidad.puesto.id !== selectedNeed.puesto.id || necesidad.item.producto.id !== selectedNeed.item.producto.id) {
          return necesidad
        }

        const cantidadComprometida = (necesidad.cantidadComprometida ?? 0) + parsedCantidad
        const cantidadPendiente = Math.max((necesidad.cantidadNecesaria ?? necesidad.item.cantidad) - cantidadComprometida, 0)

        return {
          ...necesidad,
          cantidadComprometida,
          cantidadPendiente,
          item: {
            ...necesidad.item,
            cantidad: cantidadPendiente,
            nivelStock: cantidadPendiente <= 0 ? 'alto' : necesidad.item.nivelStock,
          },
        }
      }))
      setMensajeDonacion('Donacion registrada correctamente. El puesto ya puede verla como ayuda comprometida.')
      setVistaDonacion('mis-donaciones')
      setCantidad('')
      setComentarioDonacion('')
      setSeleccion('')
    } catch (err: unknown) {
      setErrorDonacion(getApiErrorMessage(err, 'No se ha podido registrar la donación.'))
    } finally {
      setDonacionLoading(false)
    }
  }
  */

  const handleActualizarEstadoDonacion = async (donacion: Donacion, estado: 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA') => {

    if (!isOnline) {
      if (!donacion.id.startsWith('offline-')) {
        await enqueueSync({
          entity: 'donacion',
          method: 'PATCH',
          url: `/api/donaciones/${donacion.id}/estado`,
          body: { estado },
          priority: estado === 'CANCELADA' ? 'normal' : 'high',
        })
      }

      setMisDonaciones((current) => current.map((item) => (
        item.id === donacion.id ? { ...item, estado } : item
      )))
      setMensajeDonacion('Sin conexion: cambio guardado y pendiente de sincronizar.')
      return
    }

    setEstadoLoadingId(donacion.id)
    try {
      const { data } = await apiClient.patch(`/api/donaciones/${donacion.id}/estado`, { estado })
      setMisDonaciones((current) => current.map((item) => (
        item.id === donacion.id ? data.donacion : item
      )))
      if (estado === 'ENTREGADA') {
        setMensajeDonacion('Donacion marcada como entregada. Ya puedes elegir otra actividad.')
      }
      if (estado === 'CANCELADA') {
        setMensajeDonacion('Donacion cancelada. Ya puedes elegir otra actividad.')
        setNecesidadesApi((current) => current.map((necesidad) => {
          if (necesidad.puesto.id !== donacion.puesto.id || necesidad.item.producto.id !== donacion.producto.id) {
            return necesidad
          }

          const cantidadComprometida = Math.max((necesidad.cantidadComprometida ?? 0) - donacion.cantidad, 0)
          const cantidadPendiente = Math.max((necesidad.cantidadNecesaria ?? necesidad.item.cantidad) - cantidadComprometida, 0)

          return {
            ...necesidad,
            cantidadComprometida,
            cantidadPendiente,
            item: {
              ...necesidad.item,
              cantidad: cantidadPendiente,
              nivelStock: cantidadPendiente <= 0 ? 'alto' : necesidad.item.nivelStock,
            },
          }
        }))
      }
    } catch (err: unknown) {
      setErrorDonacion(getApiErrorMessage(err, 'No se pudo actualizar la donación.'))
    } finally {
      setEstadoLoadingId('')
    }
  }

  const handleGenerarCodigoEntrega = async (donacion: Donacion) => {
    setErrorDonacion('')

    if (donacion.entregaCodigo) {
      setCodigosEntrega((current) => ({
        ...current,
        [donacion.id]: current[donacion.id] ?? createCodigoEntregaPayload(donacion, donacion.entregaCodigo!),
      }))
      setMensajeDonacion('Codigo de entrega listo. Enseñalo en el puesto para confirmar la llegada.')
      return
    }

    if (!isOnline) {
      const entregaCodigo = createOfflineEntregaCodigo(donacion.id)
      if (!donacion.id.startsWith('offline-')) {
        await enqueueSync({
          entity: 'donacion',
          method: 'POST',
          url: `/api/donaciones/${donacion.id}/codigo-entrega`,
          priority: 'critical',
        })
      }
      const donacionConCodigo = {
        ...donacion,
        entregaCodigo,
        entregaCodigoGeneradoAt: new Date().toISOString(),
      }
      setMisDonaciones((current) => current.map((item) => (
        item.id === donacion.id ? donacionConCodigo : item
      )))
      setCodigosEntrega((current) => ({
        ...current,
        [donacion.id]: createCodigoEntregaPayload(donacionConCodigo, entregaCodigo),
      }))
      setMensajeDonacion('Sin conexion: codigo temporal generado y solicitud pendiente de sincronizar.')
      return
    }

    setEstadoLoadingId(donacion.id)
    try {
      const { data } = await apiClient.post(`/api/donaciones/${donacion.id}/codigo-entrega`)
      const donacionActualizada = data.donacion as Donacion
      const entregaCodigo = donacionActualizada.entregaCodigo
      setMisDonaciones((current) => current.map((item) => (
        item.id === donacion.id ? donacionActualizada : item
      )))
      if (entregaCodigo) {
        setCodigosEntrega((current) => ({
          ...current,
          [donacion.id]: createCodigoEntregaPayload(donacionActualizada, entregaCodigo),
        }))
      }
      setMensajeDonacion('Codigo de entrega generado. Enseñalo en el puesto para confirmar la llegada.')
    } catch (err: unknown) {
      setErrorDonacion(getApiErrorMessage(err, 'No se pudo generar el código de entrega.'))
    } finally {
      setEstadoLoadingId('')
    }
  }

  const handleActualizarEstadoDonaciones = async (
    donaciones: Donacion[],
    estado: 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA',
  ) => {
    for (const donacion of donaciones) {
      await handleActualizarEstadoDonacion(donacion, estado)
    }
  }

  const handleUpdateDashboardQrQty = async (donacionId: string, delta: number) => {
    setErrorDonacion('')
    const don = misDonaciones.find((d) => d.id === donacionId)
    if (!don) return

    const currentVal = don.cantidad
    const nextVal = Math.min(10000, Math.max(1, currentVal + delta))

    // Update locally immediately
    setMisDonaciones((current) =>
      current.map((item) =>
        item.id === donacionId ? { ...item, cantidad: nextVal } : item
      )
    )

    // Update on backend or queue sync
    try {
      if (isOnline) {
        await apiClient.patch(`/api/donaciones/${donacionId}/cantidad`, { cantidad: nextVal })
      } else {
        await enqueueSync({
          entity: 'donacion',
          method: 'PATCH',
          url: `/api/donaciones/${donacionId}/cantidad`,
          body: { cantidad: nextVal },
          priority: 'high',
        })
      }

      // If we already have a generated delivery code, update its payload in codigosEntrega so the QR changes in real-time!
      if (don.entregaCodigo) {
        const updatedDon = { ...don, cantidad: nextVal }
        setCodigosEntrega((current) => ({
          ...current,
          [donacionId]: createCodigoEntregaPayload(updatedDon, don.entregaCodigo!),
        }))
      }
    } catch (err) {
      setErrorDonacion('No se pudo actualizar la cantidad en el servidor.')
    }
  }

  const handleGenerarCodigosEntrega = async (donaciones: Donacion[]) => {
    for (const donacion of donaciones) {
      await handleGenerarCodigoEntrega(donacion)
    }
  }

  const handleConfirmarYGenerarQr = async (
    updates: Array<{ id: string; cantidad: number; original: number }>,
    donacionesStop: Donacion[],
  ) => {
    setErrorDonacion('')
    setDonacionLoading(true)
    try {
      // 1. Update quantities for any modified donations
      for (const update of updates) {
        if (update.cantidad !== update.original) {
          if (isOnline) {
            await apiClient.patch(`/api/donaciones/${update.id}/cantidad`, {
              cantidad: update.cantidad,
            })
          } else {
            await enqueueSync({
              entity: 'donacion',
              method: 'PATCH',
              url: `/api/donaciones/${update.id}/cantidad`,
              body: { cantidad: update.cantidad },
              priority: 'critical',
            })
          }
          // Update local state misDonaciones
          setMisDonaciones((current) =>
            current.map((item) =>
              item.id === update.id ? { ...item, cantidad: update.cantidad } : item
            )
          )
        }
      }

      // 2. Put the donations EN_CAMINO if they are PENDIENTE
      const updatedStopDonaciones = donacionesStop.map((don) => {
        const matchingUpdate = updates.find((u) => u.id === don.id)
        return matchingUpdate ? { ...don, cantidad: matchingUpdate.cantidad } : don
      })

      const pendientes = updatedStopDonaciones.filter((don) => don.estado === 'PENDIENTE')
      if (pendientes.length > 0) {
        await handleActualizarEstadoDonaciones(pendientes, 'EN_CAMINO')
      }

      // 3. Generate QR codes
      const enCamino = updatedStopDonaciones.filter((don) => don.estado === 'PENDIENTE' || don.estado === 'EN_CAMINO')
      await handleGenerarCodigosEntrega(enCamino)
      
      // Close the modal and show the QRs modal
      setMostrarModalEditarDonaciones(false)
      setMostrarModalQrs(true)
    } catch (err: unknown) {
      setErrorDonacion(getApiErrorMessage(err, 'No se pudieron actualizar las cantidades de la entrega.'))
    } finally {
      setDonacionLoading(false)
    }
  }

  const puestoActividad = actividadManualActiva?.tipo === 'puesto'
    ? puestos.find((puesto) => puesto.id === actividadManualActiva.id) ?? puestoActivoAsignado ?? undefined
    : undefined
  const incidenciaActividad = actividadManualActiva?.tipo === 'incidencia'
    ? incidencias.find((incidencia) => incidencia.id === actividadManualActiva.id)
    : undefined
  const codigoEntregaActividad = donacionActiva
    ? codigosEntrega[donacionActiva.id] ?? (
      donacionActiva.entregaCodigo ? createCodigoEntregaPayload(donacionActiva, donacionActiva.entregaCodigo) : ''
    )
    : ''
  const actividadRutaId = donacionActiva
    ? donacionActiva.id
    : incidenciaActividad
      ? `incidencia:${incidenciaActividad.id}`
      : puestoActividad
        ? `puesto:${puestoActividad.id}`
        : ''
  const rutaActividadVisible = rutaActiva && actividadRutaId && rutaActiva.donacionId === actividadRutaId
  const inventarioPuestoConBasicos = useMemo<InventarioPuestoCard[]>(() => {
    const byKey = new globalThis.Map<string, InventarioPuestoCard>()
    SUGERENCIAS_INVENTARIO_PUESTO.map(createInventarioBasico).forEach((item) => {
      const key = getInventarioProductoKey(item.producto)
      byKey.set(key, {
        key,
        producto: item.producto,
        virtual: item,
        cantidadDisponible: 0,
        cantidadNecesaria: 0,
        estado: 'sin-stock',
        isBasico: true,
      })
    })
    inventarioPuestoActivo.forEach((item) => {
      const key = getInventarioProductoKey(item.producto)
      const tipo = normalizeTipoInventario(item.tipo)
      const current = byKey.get(key) ?? {
        key,
        producto: item.producto,
        cantidadDisponible: 0,
        cantidadNecesaria: 0,
        estado: 'sin-stock' as const,
        isBasico: isProductoBasico(item.producto),
      }
      if (tipo === 'necesario') {
        current.necesario = item
        current.cantidadNecesaria = item.cantidad
      } else {
        current.disponible = item
        current.cantidadDisponible = item.cantidad
      }
      current.producto = current.disponible?.producto ?? current.necesario?.producto ?? current.virtual?.producto ?? item.producto
      current.estado = current.cantidadDisponible > 0
        ? 'disponible'
        : current.cantidadNecesaria > 0
          ? 'necesario'
          : 'sin-stock'
      byKey.set(key, current)
    })
    return Array.from(byKey.values()).sort((a, b) => (
      a.estado.localeCompare(b.estado, 'es') ||
      a.producto.nombre.localeCompare(b.producto.nombre, 'es')
    ))
  }, [inventarioPuestoActivo])
  const inventarioPuestoFiltrado = useMemo(() => {
    const query = inventarioPuestoQuery.trim().toLocaleLowerCase('es')

    return inventarioPuestoConBasicos.filter((item) => {
      const nivel = item.disponible ? getNivelInventario(item.disponible) : item.estado === 'sin-stock' ? 'critico' : 'necesario'
      const matchesFiltro =
        inventarioPuestoFiltro === 'todos' ||
        (inventarioPuestoFiltro === 'disponible' && item.estado === 'disponible') ||
        (inventarioPuestoFiltro === 'necesario' && item.estado === 'necesario') ||
        (inventarioPuestoFiltro === 'critico' && nivel === 'critico')

      if (!matchesFiltro) return false
      if (!query) return true

      return `${item.producto.nombre} ${item.producto.categoria} ${item.producto.unidad}`
        .toLocaleLowerCase('es')
        .includes(query)
    })
  }, [inventarioPuestoConBasicos, inventarioPuestoFiltro, inventarioPuestoQuery])

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-50 pb-24 text-slate-900 safe-bottom">
      <main className="mx-auto max-w-6xl px-4 pt-5">
        {actividadActiva && actividadActiva.tipo !== 'donacion' && (
          <section className="rounded-lg border border-cyan-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700">Mi actividad actual</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{actividadActiva.nombre}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {actividadActiva.tipo === 'incidencia'
                    ? 'Ayuda asignada a incidencia'
                    : 'Apoyo activo en puesto'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[430px]">
                {incidenciaActividad && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleComoLlegarIncidencia(incidenciaActividad)}
                    >
                      Ver ruta
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => abrirFinalizacionIncidencia(incidenciaActividad)}
                    >
                      Finalizar
                    </Button>
                  </>
                )}
                {puestoActividad && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleComoLlegar(puestoActividad, `puesto:${puestoActividad.id}`)}
                    >
                      Ver ruta
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void finalizarAyudaManual()}
                    >
                      Finalizar
                    </Button>
                  </>
                )}
              </div>
            </div>
            {codigoEntregaActividad && donacionActiva && (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50 p-4 sm:flex-row">
                <div className="rounded-lg border border-cyan-100 bg-white p-3 shadow-sm">
                  <QRCodeSVG value={codigoEntregaActividad} size={240} level="M" includeMargin />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-sm font-semibold text-cyan-950">Codigo de entrega activo</p>
                  <p className="mt-1 text-sm text-cyan-900">Enseña este QR en el puesto para confirmar la recepcion.</p>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(codigoEntregaActividad)}
                    className="mt-2 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                  >
                    Copiar codigo
                  </button>
                </div>
              </div>
            )}
            {puestoActividad && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Inventario del puesto</p>
                    <p className="mt-1 text-xs text-slate-500">Actualiza stock, registra necesidades y escanea codigos QR mientras sigas aceptado en el equipo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowPuestoQr(true)}>
                      Escanear QR
                    </Button>
                    <Button type="button" size="sm" onClick={() => setShowAddInventarioPuesto(true)}>
                      + Anadir
                    </Button>
                  </div>
                </div>
                {puestoQrResult && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    QR leido: <span className="font-medium break-all">{puestoQrResult}</span>
                  </div>
                )}
                {inventarioPuestoError && (
                  <div className="mt-3">
                    <Notice tone="danger">{inventarioPuestoError}</Notice>
                  </div>
                )}
                <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    value={inventarioPuestoQuery}
                    onChange={(event) => setInventarioPuestoQuery(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
                    placeholder="Buscar producto, categoria o unidad"
                  />
                  <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-white p-1">
                    {([
                      ['todos', 'Todos'],
                      ['disponible', 'Disp.'],
                      ['necesario', 'Neces.'],
                      ['critico', 'Critico'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setInventarioPuestoFiltro(value)}
                        className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                          inventarioPuestoFiltro === value
                            ? 'bg-cyan-700 text-white'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {inventarioPuestoActivoLoading ? (
                  <p className="mt-4 text-sm text-slate-500">Cargando inventario...</p>
                ) : inventarioPuestoFiltrado.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                    No hay productos que coincidan con el filtro.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {inventarioPuestoFiltrado.map((card) => {
                      const nivel = card.disponible ? getNivelInventario(card.disponible) : card.estado === 'sin-stock' ? 'critico' : 'necesario'
                      const badgeVariant = card.estado === 'necesario' ? 'warning' : card.estado === 'sin-stock' || nivel === 'critico' ? 'danger' : 'success'
                      const badgeText = card.estado === 'necesario' ? 'Necesario' : card.estado === 'sin-stock' ? 'Sin stock' : nivel === 'critico' ? 'Critico' : 'Disponible'
                      const cantidadPrincipal = card.estado === 'necesario' ? card.cantidadNecesaria : card.cantidadDisponible
                      const labelPrincipal = card.estado === 'necesario' ? 'Cantidad necesaria' : 'Cantidad disponible'

                      return (
                      <div
                        key={card.key}
                        className={`rounded-lg border bg-white px-3 py-3 ${
                          card.estado === 'necesario' ? 'border-amber-200' : card.estado === 'sin-stock' || nivel === 'critico' ? 'border-red-200' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{card.producto.nombre}</p>
                            <p className="mt-1 text-xs text-slate-500">{card.producto.categoria} - {card.producto.unidad}</p>
                          </div>
                            <Badge variant={badgeVariant}>
                              {badgeText}
                            </Badge>
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                          <span className="block text-xs font-medium text-slate-500">
                            {labelPrincipal}
                          </span>
                          <span className="mt-1 block text-lg font-semibold text-slate-950">
                            {cantidadPrincipal} {card.producto.unidad}
                          </span>
                          {card.estado === 'necesario' && card.cantidadDisponible > 0 && (
                            <span className="mt-1 block text-xs text-slate-500">
                              Tambien hay {card.cantidadDisponible} {card.producto.unidad} disponibles.
                            </span>
                          )}
                          {card.estado === 'disponible' && card.cantidadNecesaria > 0 && (
                            <span className="mt-1 block text-xs text-amber-700">
                              Necesidad registrada: {card.cantidadNecesaria} {card.producto.unidad}.
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Button
                            type="button"
                              size="sm"
                              variant="secondary"
                              disabled={card.estado !== 'necesario' && card.cantidadDisponible <= 0}
                              onClick={() => setOperacionInventarioPuesto({ card, operacion: 'salida' })}
                            >
                              {card.estado === 'necesario' ? 'Falta mas' : 'Salida'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={card.estado === 'necesario'}
                              onClick={() => setOperacionInventarioPuesto({ card, operacion: 'necesidad' })}
                            >
                              Necesitar
                            </Button>
                            <Button
                              type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setOperacionInventarioPuesto({ card, operacion: 'ajuste' })}
                          >
                            Ajustar
                          </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setOperacionInventarioPuesto({ card, operacion: 'entrada' })}
                            >
                              {card.estado === 'necesario' ? 'Llegada' : 'Entrada'}
                            </Button>
                        </div>
                        {!card.isBasico && (
                          <button
                            type="button"
                            onClick={() => void eliminarProductoInventarioPuesto(card)}
                            className="mt-3 text-xs font-medium text-red-500 hover:text-red-700"
                          >
                            Eliminar producto
                          </button>
                        )}
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {rutaError && rutaErrorDonacionId === actividadRutaId && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <p>{rutaError}</p>
                {rutaError.includes('ubicacion') && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2 w-full sm:w-auto"
                    onClick={() => {
                      if (donacionActiva) void handleComoLlegar(donacionActiva.puesto, donacionActiva.id)
                      else if (incidenciaActividad) handleComoLlegarIncidencia(incidenciaActividad)
                      else if (puestoActividad) void handleComoLlegar(puestoActividad, `puesto:${puestoActividad.id}`)
                    }}
                  >
                    Compartir ubicacion
                  </Button>
                )}
              </div>
            )}
            {rutaActividadVisible && (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Ruta a {rutaActiva.puesto.nombre}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {rutaActiva.distanciaKm.toFixed(1)} km - ~{rutaActiva.duracionMin} min
                        {rutaActiva.incidenciasEvitadas > 0 && ` - evita ${rutaActiva.incidenciasEvitadas} incidencia${rutaActiva.incidenciasEvitadas === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRutaActiva(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-950"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
                <Map
                  className="h-72"
                  center={[rutaActiva.puesto.latitud, rutaActiva.puesto.longitud]}
                  userPosition={userPosition}
                  onUserLocated={setUserPosition}
                  puestos={rutaActiva.puesto.id.startsWith('incidencia-') ? [] : puestoRutaMarker}
                  incidencias={incidencias as IncidenciaMarker[]}
                  selectedPuestoId={rutaActiva.puesto.id}
                  route={rutaActiva.points}
                  markerVariant="neutral"
                />
                <RouteSafetyPanel
                  distanciaKm={rutaActiva.distanciaKm}
                  duracionMin={rutaActiva.duracionMin}
                  incidenciasEvitadas={rutaActiva.incidenciasEvitadas}
                  incidenciasCercanas={rutaActiva.incidenciasCercanas}
                  destino={rutaActiva.puesto.nombre}
                />
              </div>
            )}
          </section>
        )}
        {accion && accion !== 'donacion' && !estaGestionandoPuesto && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Actividad elegida</p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
                {actionMeta[accion].title}
              </h2>
            </div>
            {!actividadActiva && (
              <Button type="button" variant="secondary" size="sm" onClick={volverASelector}>
                Volver
              </Button>
            )}
          </div>
        )}
        {!accion && !estaGestionandoPuesto && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              title="Que quieres hacer ahora?"
              subtitle="Elige una linea de trabajo. Cuando inicies una actividad, el resto quedara bloqueado hasta que la termines."
            />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            icon="📦"
            title="Hacer una donacion"
            subtitle="Compromete material necesario y confirma la entrega en el puesto."
            onClick={() => resetSelection('donacion')}
          />
          <ActionCard
            icon="🚧"
            title="Ayudar en incidencia"
            subtitle="Apuntate a un aviso abierto y mantente asignado hasta cerrarlo."
            onClick={() => resetSelection('incidencia')}
          />
          <ActionCard
            icon="🏪"
            title="Ayudar en puesto"
            subtitle="Incorporate como apoyo operativo en un punto de asistencia."
            onClick={() => resetSelection('puesto')}
          />
            </div>
          </section>
        )}
      </main>


      {accion && !estaGestionandoPuesto && (
      <main className="mx-auto max-w-6xl px-4 pt-5">
        {loading ? (
          <EmptyState>Cargando opciones disponibles...</EmptyState>
        ) : (
          <>
                {accion === 'donacion' && (
              <section className="space-y-3">
                {donacionesActivas.length === 0 || forzarNuevoFlujoDonacion ? (
                  <NuevoFlujoDonacion
                    objetosDonables={objetosDonables}
                    userPosition={userPosition}
                    incidencias={incidencias as IncidenciaMarker[]}
                    isOnline={isOnline}
                    enqueueSync={enqueueSync}
                    onFinalizarDonacion={() => {
                      setForzarNuevoFlujoDonacion(false)
                      setRealtimeRefresh((current) => current + 1)
                    }}
                    onVolverDashboard={() => {
                      if (donacionesActivas.length > 0) {
                        setForzarNuevoFlujoDonacion(false)
                      } else {
                        volverASelector()
                      }
                    }}
                    initialStep={wizardMode === 'navigate' ? 'navegacion' : 'productos'}
                    initialDonations={donacionesActivas}
                  />
                ) : (
                  <div>
                    {errorDonacion && (
                      <Notice tone="danger">{errorDonacion}</Notice>
                    )}

                    {(() => {
                      const currentStop = paradasDonacionesActivas[0]
                      if (!currentStop) return null

                      // Proximity check
                      const distKm = userPosition
                        ? haversineKm(userPosition[0], userPosition[1], currentStop.puesto.latitud, currentStop.puesto.longitud)
                        : null
                      const esCercano = distKm !== null && distKm <= 0.1 // Less than 100 meters

                      const codigos = currentStop.donaciones
                        .map((donacion) => ({
                          donacion,
                          codigo: codigosEntrega[donacion.id] ?? (
                            donacion.entregaCodigo ? createCodigoEntregaPayload(donacion, donacion.entregaCodigo) : ''
                          ),
                        }))
                        .filter((item) => item.codigo)

                      return (
                        <div className="space-y-4">
                          {/* Main Accessible Navigation Header */}
                          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Entregando en:</p>
                              <h3 className="text-lg font-bold text-slate-950 mt-0.5">{currentStop.puesto.nombre}</h3>
                              <p className="text-sm text-slate-500">{currentStop.puesto.direccion}</p>
                            </div>

                            <div className="border-t border-slate-100 pt-3">
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Productos a entregar:</p>
                              <ul className="mt-2 space-y-2">
                                {currentStop.donaciones.map((donacion) => (
                                  <li key={donacion.id} className="flex justify-between text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg font-semibold">
                                    <span>{donacion.cantidad} {donacion.unidad} de {donacion.producto.nombre}</span>
                                    <Badge variant={donacion.estado === 'EN_CAMINO' ? 'success' : 'info'}>
                                      {donacion.estado === 'EN_CAMINO' ? 'En Camino' : 'Pendiente'}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Map Display */}
                            <div className="border-t border-slate-100 pt-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-slate-950">Itinerario y Mapa</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  loading={rutaDonacionLoading}
                                  onClick={() => void calcularRutaDonacionesActivas()}
                                >
                                  {rutaDonacionesActivas ? 'Recalcular Ruta' : 'Ver Ruta en Mapa'}
                                </Button>
                              </div>

                              {rutaDonacionesActivas ? (
                                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
                                  <Map
                                    className="h-80"
                                    center={[currentStop.puesto.latitud, currentStop.puesto.longitud]}
                                    userPosition={userPosition}
                                    onUserLocated={setUserPosition}
                                    puestos={[{ ...currentStop.puesto, necesidades: 0 }]}
                                    incidencias={incidencias as IncidenciaMarker[]}
                                    selectedPuestoId={currentStop.puesto.id}
                                    route={rutaDonacionesActivas.points}
                                    markerVariant="neutral"
                                  />
                                  <RouteSafetyPanel
                                    distanciaKm={rutaDonacionesActivas.distanciaKm}
                                    duracionMin={rutaDonacionesActivas.duracionMin}
                                    incidenciasEvitadas={rutaDonacionesActivas.incidenciasEvitadas}
                                    incidenciasCercanas={rutaDonacionesActivas.incidenciasCercanas}
                                    destino={currentStop.puesto.nombre}
                                  />

                                  {/* In-app Navigation Guidance Panel */}
                                  {iniciarGuiadoActivo && (
                                    <div className="border-t border-slate-100 bg-slate-900 text-white p-4 space-y-4">
                                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                        <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                                          🔊 Guiado activo
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setVozActiva((v) => !v)}
                                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${vozActiva ? 'bg-cyan-600/30 text-cyan-400' : 'bg-white/10 text-white/50'}`}
                                          >
                                            {vozActiva ? '🔊 Voz On' : '🔇 Mudo'}
                                          </button>
                                        </div>
                                      </div>

                                      {navLoading ? (
                                        <div className="flex justify-center items-center h-28">
                                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
                                        </div>
                                      ) : stepsNavegacion.length > 0 ? (() => {
                                        const stepObj = stepsNavegacion[stepActualIdx]
                                        const nextStepObj = stepsNavegacion[stepActualIdx + 1]
                                        const esUltimo = stepActualIdx === stepsNavegacion.length - 1
                                        const distanciaM = userPosition && stepObj
                                          ? Math.round(distanciaAlStep(userPosition[0], userPosition[1], stepObj))
                                          : null

                                        const bearingAbsoluto = userPosition && stepObj && !esUltimo
                                          ? calcularBearing(userPosition[0], userPosition[1], stepObj.lat, stepObj.lng)
                                          : null

                                        const brujulaDisponible = headingDispositivo !== null && bearingAbsoluto !== null
                                        const rotacion = brujulaDisponible
                                          ? (bearingAbsoluto! - headingDispositivo! + 360) % 360
                                          : stepObj ? ROTACION_ICONO[stepObj.icono] : 0

                                        return (
                                          <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                                                <FlechaNavegacion icono={stepObj?.icono || 'destino'} rotacion={rotacion} />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-base font-bold leading-tight">{stepObj?.instruccion}</p>
                                                {stepObj?.calle && stepObj.tipo !== 'depart' && stepObj.tipo !== 'arrive' && (
                                                  <p className="text-xs text-white/60 mt-0.5 truncate">{stepObj.calle}</p>
                                                )}
                                                {distanciaM !== null && !esUltimo && (
                                                  <p className="text-lg font-extrabold text-cyan-400 mt-1 tabular-nums">
                                                    {formatearDistanciaNav(distanciaM)}
                                                  </p>
                                                )}
                                              </div>
                                            </div>

                                            {nextStepObj && (
                                              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs flex items-center gap-2 text-white/80">
                                                <span className="font-semibold text-cyan-400 whitespace-nowrap">A continuación:</span>
                                                <span className="truncate flex-1">{nextStepObj.instruccion}</span>
                                              </div>
                                            )}

                                            {/* Navigation Controls */}
                                            <div className="flex gap-2 border-t border-white/10 pt-3">
                                              <button
                                                type="button"
                                                disabled={stepActualIdx === 0}
                                                onClick={() => setStepActualIdx((curr) => Math.max(0, curr - 1))}
                                                className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/25 active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
                                              >
                                                ← Anterior
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (esUltimo) {
                                                    setIniciarGuiadoActivo(false)
                                                    setStepsNavegacion([])
                                                    setStepActualIdx(0)
                                                    if (typeof speechSynthesis !== 'undefined') {
                                                      speechSynthesis.cancel()
                                                      const utterance = new SpeechSynthesisUtterance('Has llegado a tu destino.')
                                                      utterance.lang = 'es-ES'
                                                      speechSynthesis.speak(utterance)
                                                    }
                                                  } else {
                                                    setStepActualIdx((curr) => curr + 1)
                                                  }
                                                }}
                                                className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 active:scale-95 transition"
                                              >
                                                {esUltimo ? '¡Llegado!' : 'Siguiente →'}
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      })() : (
                                        <div className="text-center py-4 text-white/60 text-sm">
                                          No hay indicaciones disponibles para esta ruta.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 bg-slate-50">
                                  Pulsa "Ver Ruta en Mapa" para calcular el itinerario evitando calles cortadas.
                                </div>
                              )}
                            </div>

                            {/* Proximity Warning */}
                            {!esCercano && (
                              <Notice tone="warning">
                                <div className="font-semibold text-amber-900">⚠️ Recomendación para el código QR</div>
                                <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                                  Se recomienda generar el código QR directamente al llegar al destino. La ruta puede cambiar si se cubren las necesidades o surge una emergencia más crítica, lo que redirigiría tu donación a otro puesto y haría que el QR actual no sea válido.
                                </p>
                              </Notice>
                            )}

                            {/* Active Actions */}
                            <div className="border-t border-slate-100 pt-4 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                {/* Generate QR Button */}
                                 <Button
                                  type="button"
                                  variant="primary"
                                  className="py-3 text-base flex items-center justify-center gap-2 font-bold"
                                  onClick={() => {
                                    if (codigos.length > 0) {
                                      setMostrarModalQrs(true)
                                    } else {
                                      const initialCantidades: Record<string, string> = {}
                                      currentStop.donaciones.forEach((don) => {
                                        initialCantidades[don.id] = String(don.cantidad)
                                      })
                                      setCantidadesEditablesDonacion(initialCantidades)
                                      setMostrarModalEditarDonaciones(true)
                                    }
                                  }}
                                >
                                  {codigos.length > 0 ? '📱 Mostrar Código QR' : '📱 Generar Código QR'}
                                </Button>

                                {/* Navigation / Voices indications */}
                                 <Button
                                  type="button"
                                  variant={iniciarGuiadoActivo ? "danger" : "secondary"}
                                  className="py-3 text-base flex items-center justify-center gap-2 font-bold"
                                  onClick={async () => {
                                    if (iniciarGuiadoActivo) {
                                      setIniciarGuiadoActivo(false)
                                      setStepsNavegacion([])
                                      setStepActualIdx(0)
                                      if (typeof speechSynthesis !== 'undefined') {
                                        speechSynthesis.cancel()
                                      }
                                    } else {
                                      setNavLoading(true)
                                      setIniciarGuiadoActivo(true)
                                      try {
                                        const waypoints: [number, number][] = [
                                          userPosition || [currentStop.puesto.latitud + 0.003, currentStop.puesto.longitud + 0.003],
                                          [currentStop.puesto.latitud, currentStop.puesto.longitud]
                                        ]
                                        const navRes = await fetchRutaConPasos(waypoints, 'driving', incidencias as IncidenciaMarker[])
                                        const steps = parsearStepsOsrm(navRes.legs as Parameters<typeof parsearStepsOsrm>[0])
                                        setStepsNavegacion(steps)
                                        setStepActualIdx(0)
                                        announcementsRef.current = new Set()
                                        if (vozActiva && typeof speechSynthesis !== 'undefined') {
                                          const utterance = new SpeechSynthesisUtterance('Iniciando navegación guiada hacia el puesto de emergencia.')
                                          utterance.lang = 'es-ES'
                                          speechSynthesis.speak(utterance)
                                        }
                                      } catch (err) {
                                        setErrorDonacion('No se pudo calcular la ruta de guiado paso a paso.')
                                        setIniciarGuiadoActivo(false)
                                      } finally {
                                        setNavLoading(false)
                                      }
                                    }
                                  }}
                                >
                                  {iniciarGuiadoActivo ? '🛑 Detener Guiado' : '🔊 Iniciar Guiado'}
                                </Button>
                              </div>



                              {/* Manual delivery override button */}
                              <Button
                                type="button"
                                variant="primary"
                                fullWidth
                                className="py-3 font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 border-0"
                                onClick={() => setMostrarConfirmarEntregaManual(true)}
                              >
                                ✔️ Ya he entregado el producto
                              </Button>

                              {/* Cancel entire donation stop */}
                              <Button
                                type="button"
                                variant="danger"
                                fullWidth
                                className="py-3 font-bold"
                                onClick={() => {
                                  if (window.confirm('¿Seguro que deseas cancelar toda la donación comprometida?')) {
                                    void handleActualizarEstadoDonaciones(currentStop.donaciones, 'CANCELADA').then(() => {
                                      setForzarNuevoFlujoDonacion(false)
                                      setRealtimeRefresh((current) => current + 1)
                                    })
                                  }
                                }}
                              >
                                ❌ Cancelar Donación y Empezar de Nuevo
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })()}



                    {/*
                    {rutaError && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <p>{rutaError}</p>
                        {rutaError.includes('ubicacion') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="mt-2"
                            onClick={requestGeo}
                          >
                            Compartir ubicacion
                          </Button>
                        )}
                      </div>
                    )}

                    {rutaActiva && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-blue-900">Ruta segura a {rutaActiva.puesto.nombre}</p>
                              <p className="mt-1 text-xs text-blue-700">
                                {rutaActiva.distanciaKm.toFixed(1)} km · ~{rutaActiva.duracionMin} min
                                {rutaActiva.incidenciasEvitadas > 0 && ` · evita ${rutaActiva.incidenciasEvitadas} incidencia${rutaActiva.incidenciasEvitadas === 1 ? '' : 's'}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setRutaActiva(null)}
                              className="text-xs font-medium text-blue-700 hover:text-blue-900"
                            >
                              Cerrar
                            </button>
                          </div>
                        </div>
                        <Map
                          className="h-80"
                          center={[rutaActiva.puesto.latitud, rutaActiva.puesto.longitud]}
                          userPosition={userPosition}
                          onUserLocated={setUserPosition}
                          puestos={puestoRutaMarker}
                          incidencias={incidencias as IncidenciaMarker[]}
                          selectedPuestoId={rutaActiva.puesto.id}
                          route={rutaActiva.points}
                          markerVariant="neutral"
                        />
                      </div>
                    )} */}
                  </div>
                )}
              </section>
            )}

            {accion === 'incidencia' && (
              <section className="space-y-3">
                <SectionHeader
                  title="Incidencias abiertas"
                  subtitle="Elige una incidencia en la que puedas ayudar."
                />

                {errorDonacion && (
                  <Notice tone="danger">{errorDonacion}</Notice>
                )}

                {!userPosition && (
                  <Notice tone="info">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>Comparte tu ubicacion para ordenar las calles cortadas por cercania.</span>
                      <Button type="button" size="sm" variant="secondary" onClick={requestGeo}>
                        Usar mi ubicacion
                      </Button>
                    </div>
                  </Notice>
                )}

                {incidenciasCortadas.length === 0 ? (
                  <EmptyState>No hay calles cortadas registradas ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {incidenciasCortadas.map((incidencia) => {
                      const selected = seleccion === incidencia.id
                      const incidenciaActiva = actividadManualActiva?.tipo === 'incidencia' && actividadManualActiva.id === incidencia.id
                      const categoria = getIncidenciaCategoria(incidencia)
                      const titulo = getIncidenciaTitulo(incidencia)
                      const resumen = getIncidenciaResumen(incidencia)

                      return (
                        <div key={incidencia.id} className={cardClass(selected)}>
                          <button
                            type="button"
                            onClick={() => setSeleccion(selected ? '' : incidencia.id)}
                            className="w-full p-4 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{titulo}</p>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{resumen}</p>
                                <p className="mt-1 text-xs font-medium text-amber-700">{categoria.label}</p>
                                {incidencia.distanciaKm !== undefined && (
                                  <p className="mt-1 text-xs font-medium text-cyan-700">
                                    {incidencia.distanciaKm.toFixed(1)} km de tu ubicacion
                                  </p>
                                )}
                                {incidencia._count?.asignacionesVoluntarios !== undefined && (
                                  <p className="mt-1 text-xs text-slate-400">
                                    {incidencia._count.asignacionesVoluntarios} voluntario{incidencia._count.asignacionesVoluntarios === 1 ? '' : 's'} asignado{incidencia._count.asignacionesVoluntarios === 1 ? '' : 's'}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge variant={incidencia.estado === 'CORTADA' ? 'danger' : 'success'}>
                                  {incidencia.estado === 'CORTADA' ? 'Cortada' : 'Transitable'}
                                </Badge>
                                <span className="text-xs font-medium text-slate-400">{selected ? 'Cerrar' : 'Ver detalle'}</span>
                              </div>
                            </div>
                          </button>

                          {selected && (
                            <div className="border-t border-slate-200 bg-slate-50 p-4">
                              <p className="text-sm font-semibold text-slate-900">Incidencia seleccionada</p>
                              <p className="mt-1 text-sm text-slate-600">{resumen}</p>
                              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                                  <p className="font-medium text-slate-500">Categoria</p>
                                  <p className="mt-1 font-semibold text-slate-800">{categoria.label}</p>
                                </div>
                                <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
                                  <p className="font-medium text-slate-500">Ubicacion</p>
                                  <p className="mt-1 font-semibold text-slate-800">
                                    {incidencia.latitud.toFixed(5)}, {incidencia.longitud.toFixed(5)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-3">
                                <p className="text-xs font-semibold uppercase text-amber-700">Equipamiento recomendado</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {categoria.equipment.map((item) => (
                                    <span key={item} className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleComoLlegarIncidencia(incidencia)}
                                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-800"
                                disabled={rutaLoading}
                              >
                                {rutaLoadingId === `incidencia:${incidencia.id}` ? 'Calculando ruta...' : 'Como llegar'}
                              </button>
                              {rutaError && rutaErrorDonacionId === `incidencia:${incidencia.id}` && (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                  <p>{rutaError}</p>
                                  {rutaError.includes('ubicacion') && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="mt-2 w-full sm:w-auto"
                                      onClick={() => handleComoLlegarIncidencia(incidencia)}
                                    >
                                      Compartir ubicacion
                                    </Button>
                                  )}
                                </div>
                              )}
                              {rutaActiva?.donacionId === `incidencia:${incidencia.id}` && (
                                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                  <div className="border-b border-slate-200 bg-white px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-950">Ruta segura a la incidencia</p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {rutaActiva.distanciaKm.toFixed(1)} km Â· ~{rutaActiva.duracionMin} min
                                          {rutaActiva.incidenciasEvitadas > 0 && ` Â· evita ${rutaActiva.incidenciasEvitadas} incidencia${rutaActiva.incidenciasEvitadas === 1 ? '' : 's'}`}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setRutaActiva(null)}
                                        className="text-xs font-medium text-slate-500 hover:text-slate-950"
                                      >
                                        Cerrar
                                      </button>
                                    </div>
                                  </div>
                                  <Map
                                    className="h-72"
                                    center={[incidencia.latitud, incidencia.longitud]}
                                    userPosition={userPosition}
                                    onUserLocated={setUserPosition}
                                    incidencias={incidencias as IncidenciaMarker[]}
                                    route={rutaActiva.points}
                                    markerVariant="neutral"
                                  />
                                  <RouteSafetyPanel
                                    distanciaKm={rutaActiva.distanciaKm}
                                    duracionMin={rutaActiva.duracionMin}
                                    incidenciasEvitadas={rutaActiva.incidenciasEvitadas}
                                    incidenciasCercanas={rutaActiva.incidenciasCercanas}
                                    destino={rutaActiva.puesto.nombre}
                                  />
                                </div>
                              )}
                              {incidenciaActiva ? (
                                <Button
                                  fullWidth
                                  variant="secondary"
                                  className="mt-3"
                                  onClick={() => abrirFinalizacionIncidencia(incidencia)}
                                >
                                  Terminar ayuda en incidencia
                                </Button>
                              ) : (
                                <Button
                                  fullWidth
                                  className="mt-3"
                                  disabled={Boolean(actividadActiva)}
                                  onClick={() => abrirConfirmacionAyudaIncidencia(incidencia)}
                                >
                                  Ayudar
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {historialIncidencias.length > 0 && (
                  <div className="mt-5">
                    <SectionHeader
                      title="Historial de incidencias"
                      subtitle="Incidencias en las que ya has colaborado."
                    />
                    <div className="mt-3 space-y-2">
                      {historialIncidencias.slice(0, 8).map((asignacion) => (
                        <div key={asignacion.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {asignacion.incidencia.descripcion || 'Incidencia sin descripcion'}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Inicio: {formatDateTime(asignacion.startedAt)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                Fin: {formatDateTime(asignacion.endedAt)}
                              </p>
                            </div>
                            <Badge variant={asignacion.estado === 'FINALIZADA' ? 'success' : 'danger'}>
                              {asignacion.estado}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </section>
            )}

            {accion === 'puesto' && (
              <section className="space-y-3">
                <SectionHeader
                  title="Puestos de asistencia"
                  subtitle="Elige un puesto para incorporarte como apoyo."
                />

                {errorDonacion && (
                  <Notice tone="danger">{errorDonacion}</Notice>
                )}

                {puestos.length === 0 ? (
                  <EmptyState>No hay puestos activos ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {puestos.map((puesto, index) => {
                      const ocupacion = ocupacionPorPuesto[puesto.id] ?? ocupacionInicialPuesto(puesto, index)
                      const huecosLibres = Math.max(ocupacion.capacidad - ocupacion.trabajando, 0)
                      const lleno = huecosLibres === 0
                      const porcentaje = Math.min((ocupacion.trabajando / ocupacion.capacidad) * 100, 100)
                      const selected = seleccion === puesto.id
                      const puestoActivo = actividadManualActiva?.tipo === 'puesto' && actividadManualActiva.id === puesto.id
                      const solicitudParticipacion = solicitudesParticipacionPorPuesto.get(puesto.id)
                      const solicitudPendiente = solicitudParticipacion?.estado === 'PENDIENTE'

                      return (
                        <div key={puesto.id} className={cardClass(selected)}>
                          <button
                            type="button"
                            onClick={() => setSeleccion(puesto.id)}
                            className="w-full p-4 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-800">{puesto.nombre}</p>
                                <p className="mt-1 text-sm text-slate-500">{puesto.direccion}</p>
                                <p className="mt-1 text-xs text-slate-400">{puesto.tipo}</p>
                              </div>
                              <Badge variant={lleno ? 'danger' : 'success'}>
                                {lleno ? 'Completo' : `${huecosLibres} hueco${huecosLibres === 1 ? '' : 's'}`}
                              </Badge>
                            </div>
                            <div className="mt-4">
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-500">Voluntarios trabajando</span>
                                <span className="font-semibold text-slate-700">{ocupacion.trabajando}/{ocupacion.capacidad}</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${lleno ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${porcentaje}%` }}
                                />
                              </div>
                            </div>
                          </button>

                          {selected && (
                            <div className="border-t border-slate-200 bg-slate-50 p-4">
                              <p className={`text-xs ${lleno ? 'text-red-600' : 'text-slate-600'}`}>
                                {solicitudPendiente
                                  ? 'Tu solicitud esta pendiente de revision por el responsable del puesto.'
                                  : solicitudParticipacion?.estado === 'RECHAZADA'
                                    ? `Solicitud rechazada${solicitudParticipacion.motivoRechazo ? `: ${solicitudParticipacion.motivoRechazo}` : '.'}`
                                    : lleno
                                  ? 'Este puesto esta lleno ahora mismo.'
                                  : `Quedan ${huecosLibres} hueco${huecosLibres === 1 ? '' : 's'} disponible${huecosLibres === 1 ? '' : 's'}.`}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleComoLlegar(puesto, `puesto:${puesto.id}`)}
                                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-60"
                                disabled={rutaLoading}
                              >
                                {rutaLoadingId === `puesto:${puesto.id}` ? 'Calculando ruta...' : 'Como llegar'}
                              </button>
                              {rutaError && rutaErrorDonacionId === `puesto:${puesto.id}` && (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                  <p>{rutaError}</p>
                                  {rutaError.includes('ubicacion') && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="mt-2 w-full sm:w-auto"
                                      onClick={() => handleComoLlegar(puesto, `puesto:${puesto.id}`)}
                                    >
                                      Compartir ubicacion
                                    </Button>
                                  )}
                                </div>
                              )}
                              {rutaActiva?.donacionId === `puesto:${puesto.id}` && (
                                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-950">Ruta segura a {puesto.nombre}</p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {rutaActiva.distanciaKm.toFixed(1)} km · ~{rutaActiva.duracionMin} min
                                          {rutaActiva.incidenciasEvitadas > 0 && ` · evita ${rutaActiva.incidenciasEvitadas} incidencia${rutaActiva.incidenciasEvitadas === 1 ? '' : 's'}`}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setRutaActiva(null)}
                                        className="text-xs font-medium text-slate-500 hover:text-slate-950"
                                      >
                                        Cerrar
                                      </button>
                                    </div>
                                  </div>
                                  <Map
                                    className="h-72"
                                    center={[puesto.latitud, puesto.longitud]}
                                    userPosition={userPosition}
                                    onUserLocated={setUserPosition}
                                    puestos={puestoRutaMarker}
                                    incidencias={incidencias as IncidenciaMarker[]}
                                    selectedPuestoId={puesto.id}
                                    route={rutaActiva.points}
                                    markerVariant="neutral"
                                  />
                                  <RouteSafetyPanel
                                    distanciaKm={rutaActiva.distanciaKm}
                                    duracionMin={rutaActiva.duracionMin}
                                    incidenciasEvitadas={rutaActiva.incidenciasEvitadas}
                                    incidenciasCercanas={rutaActiva.incidenciasCercanas}
                                    destino={rutaActiva.puesto.nombre}
                                  />
                                </div>
                              )}
                              {puestoActivo ? (
                                <Button
                                  fullWidth
                                  variant="secondary"
                                  className="mt-3"
                                  onClick={() => void finalizarAyudaManual()}
                                >
                                  Terminar ayuda en este puesto
                                </Button>
                              ) : (
                                <Button
                                  fullWidth
                                  className="mt-3"
                                  disabled={Boolean(actividadActiva) || lleno || solicitudPendiente}
                                  onClick={() => void iniciarAyudaPuesto(puesto)}
                                >
                                  {solicitudPendiente ? 'Solicitud pendiente' : lleno ? 'Puesto lleno' : 'Participar'}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {historialPuestos.length > 0 && (
                  <div className="mt-5">
                    <SectionHeader
                      title="Historial de puestos"
                      subtitle="Puestos donde ya te has incorporado como apoyo."
                    />
                    <div className="mt-3 space-y-2">
                      {historialPuestos.slice(0, 8).map((asignacion) => (
                        <div key={asignacion.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{asignacion.puesto.nombre}</p>
                              <p className="mt-1 text-xs text-slate-500">{asignacion.puesto.direccion}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(asignacion.startedAt)} - {formatDateTime(asignacion.endedAt)}
                              </p>
                            </div>
                            <Badge variant={asignacion.estado === 'FINALIZADA' ? 'success' : 'danger'}>
                              {asignacion.estado}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      )}
      {incidenciaConfirmacion && (() => {
        const categoria = getIncidenciaCategoria(incidenciaConfirmacion)
        const titulo = getIncidenciaTitulo(incidenciaConfirmacion)
        const resumen = getIncidenciaResumen(incidenciaConfirmacion)
        const loading = ayudaIncidenciaLoadingId === incidenciaConfirmacion.id

        return (
          <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-amber-700">Recomendaciones de seguridad</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">{titulo}</h2>
                  <p className="mt-1 text-sm text-slate-500">{categoria.label}</p>
                </div>
                <button
                  type="button"
                  onClick={cerrarConfirmacionAyudaIncidencia}
                  disabled={loading}
                  className="text-sm font-medium text-slate-500 hover:text-slate-950 disabled:opacity-60"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-700">{resumen}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Ubicacion: {incidenciaConfirmacion.latitud.toFixed(5)}, {incidenciaConfirmacion.longitud.toFixed(5)}
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-950">
                  Para poder realizar esta actividad de ayuda, se recomienda disponer del siguiente equipamiento por seguridad y eficiencia.
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {categoria.equipment.map((item) => (
                    <li key={item} className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-950 ring-1 ring-amber-100">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={recomendacionesLeidas}
                  onChange={(event) => setRecomendacionesLeidas(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                />
                <span>He leido y entiendo las recomendaciones de seguridad y equipamiento</span>
              </label>

              {errorDonacion && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorDonacion}
                </div>
              )}

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={cerrarConfirmacionAyudaIncidencia}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  fullWidth
                  loading={loading}
                  disabled={!recomendacionesLeidas || loading}
                  onClick={() => void iniciarAyudaIncidencia(incidenciaConfirmacion)}
                >
                  Confirmar ayuda
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
      {incidenciaFinalizacion && (
        <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
          <form
            onSubmit={finalizarAyudaIncidenciaConActualizacion}
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-700">Actualizar incidencia</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Estado actual de la calle</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {incidenciaFinalizacion.descripcion || 'Incidencia sin descripcion'}
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarFinalizacionIncidencia}
                className="text-sm font-medium text-slate-500 hover:text-slate-950"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className={`rounded-lg border px-4 py-3 text-sm transition-colors ${estadoIncidenciaFinal === 'CORTADA' ? 'border-red-300 bg-red-50 text-red-950' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input
                  type="radio"
                  name="estadoIncidenciaFinal"
                  value="CORTADA"
                  checked={estadoIncidenciaFinal === 'CORTADA'}
                  onChange={() => setEstadoIncidenciaFinal('CORTADA')}
                  className="mr-2"
                />
                La calle sigue cortada
              </label>
              <label className={`rounded-lg border px-4 py-3 text-sm transition-colors ${estadoIncidenciaFinal === 'TRANSITABLE' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-700'}`}>
                <input
                  type="radio"
                  name="estadoIncidenciaFinal"
                  value="TRANSITABLE"
                  checked={estadoIncidenciaFinal === 'TRANSITABLE'}
                  onChange={() => setEstadoIncidenciaFinal('TRANSITABLE')}
                  className="mr-2"
                />
                La calle ya es transitable
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="comentario-incidencia-final">
              Estado actual
            </label>
            <textarea
              id="comentario-incidencia-final"
              value={comentarioIncidenciaFinal}
              onChange={(event) => {
                setComentarioIncidenciaFinal(event.target.value)
                setFinalizacionIncidenciaError('')
              }}
              rows={4}
              required
              maxLength={500}
              placeholder="Describe lo que has encontrado al llegar: obstaculos, agua, escombros, paso parcial, senalizacion..."
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <p className="mt-1 text-xs text-slate-400">{comentarioIncidenciaFinal.trim().length}/500</p>

            {finalizacionIncidenciaError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {finalizacionIncidenciaError}
              </div>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={cerrarFinalizacionIncidencia}
                disabled={finalizacionIncidenciaLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                fullWidth
                loading={finalizacionIncidenciaLoading}
              >
                Actualizar y terminar
              </Button>
            </div>
          </form>
        </div>
      )}
      {showAddInventarioPuesto && (
        <AddInventarioPuestoSheet
          existingItems={inventarioPuestoActivo}
          onClose={() => setShowAddInventarioPuesto(false)}
          onCreate={crearItemInventarioPuestoActivo}
        />
      )}
      {operacionInventarioPuesto && (
        <OperacionInventarioPuestoSheet
          card={operacionInventarioPuesto.card}
          operacion={operacionInventarioPuesto.operacion}
          onClose={() => setOperacionInventarioPuesto(null)}
          onApply={aplicarOperacionInventarioPuesto}
          onAdjust={ajustarInventarioPuestoActivo}
        />
      )}
      {showPuestoQr && (
        <QrScanner
          onResult={(text) => {
            setPuestoQrResult(text)
            setShowPuestoQr(false)
          }}
          onClose={() => setShowPuestoQr(false)}
        />
      )}
      {mostrarConfirmarEntregaManual && (() => {
        const currentStop = paradasDonacionesActivas[0]
        if (!currentStop) return null

        return (
          <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Confirmación Manual</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Entrega Manual de Productos</h2>
                <p className="mt-2 text-sm text-slate-500 font-medium">
                  ¿Seguro que deseas marcar todos los productos de esta parada como entregados manualmente?
                </p>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 space-y-2">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Productos a entregar:</p>
                <div className="space-y-1">
                  {currentStop.donaciones.map((don) => (
                    <div key={don.id} className="flex justify-between items-center text-xs text-slate-700">
                      <span>• {don.producto.nombre}</span>
                      <span className="font-semibold">{don.cantidad} {don.unidad}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setMostrarConfirmarEntregaManual(false)}
                  disabled={donacionLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  className="bg-emerald-600 hover:bg-emerald-700 border-0 text-white font-semibold"
                  loading={donacionLoading}
                  onClick={async () => {
                    setDonacionLoading(true)
                    try {
                      // Stop active route guidance if any
                      setIniciarGuiadoActivo(false)
                      setStepsNavegacion([])
                      setStepActualIdx(0)
                      if (typeof speechSynthesis !== 'undefined') {
                        speechSynthesis.cancel()
                      }

                      await handleActualizarEstadoDonaciones(currentStop.donaciones, 'ENTREGADA')
                      setRutaDonacionesActivas(null)
                      setCodigosEntrega((current) => {
                        const next = { ...current }
                        currentStop.donaciones.forEach((d) => delete next[d.id])
                        return next
                      })
                      setForzarNuevoFlujoDonacion(false)
                      setRealtimeRefresh((current) => current + 1)
                      setMensajeDonacion('Donación marcada como entregada correctamente.')
                    } catch (err) {
                      setErrorDonacion('No se pudieron entregar las donaciones manualmente.')
                    } finally {
                      setDonacionLoading(false)
                      setMostrarConfirmarEntregaManual(false)
                    }
                  }}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
      {mostrarModalEditarDonaciones && (() => {
        const currentStop = paradasDonacionesActivas[0]
        if (!currentStop) return null

        return (
          <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Confirmación de entrega</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">¿Qué cantidad vas a entregar?</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Confirma o modifica las cantidades propuestas por el algoritmo antes de generar el código QR.
                </p>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {currentStop.donaciones.map((don) => {
                  const val = cantidadesEditablesDonacion[don.id] ?? String(don.cantidad)
                  return (
                    <div key={don.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{don.producto.nombre}</p>
                          <p className="text-xs text-slate-400">Puesto: {don.puesto.nombre}</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {don.unidad}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold active:scale-95 transition"
                          onClick={() => {
                            const currentVal = parseInt(val, 10) || 0
                            const nextVal = Math.min(10000, Math.max(1, currentVal - 1))
                            setCantidadesEditablesDonacion((curr) => ({
                              ...curr,
                              [don.id]: String(nextVal),
                            }))
                          }}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10000"
                          className="flex-1 h-10 rounded-lg border border-slate-200 bg-white text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          value={val}
                          onChange={(e) => {
                            const inputVal = e.target.value
                            const parsed = parseInt(inputVal, 10)
                            if (!isNaN(parsed)) {
                              if (parsed > 10000) {
                                setCantidadesEditablesDonacion((curr) => ({
                                  ...curr,
                                  [don.id]: '10000',
                                }))
                              } else {
                                setCantidadesEditablesDonacion((curr) => ({
                                  ...curr,
                                  [don.id]: inputVal,
                                }))
                              }
                            } else {
                              setCantidadesEditablesDonacion((curr) => ({
                                ...curr,
                                [don.id]: inputVal,
                              }))
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold active:scale-95 transition"
                          onClick={() => {
                            const currentVal = parseInt(val, 10) || 0
                            const nextVal = Math.min(10000, currentVal + 1)
                            setCantidadesEditablesDonacion((curr) => ({
                              ...curr,
                              [don.id]: String(nextVal),
                            }))
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  className="py-3 font-semibold"
                  onClick={() => setMostrarModalEditarDonaciones(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  className="py-3 font-bold"
                  loading={donacionLoading}
                  onClick={() => {
                    const updates = currentStop.donaciones.map((don) => {
                      const inputVal = cantidadesEditablesDonacion[don.id] ?? String(don.cantidad)
                      const cantNum = parseInt(inputVal, 10) || don.cantidad
                      return {
                        id: don.id,
                        cantidad: Math.min(10000, Math.max(1, cantNum)),
                        original: don.cantidad,
                      }
                    })
                    void handleConfirmarYGenerarQr(updates, currentStop.donaciones)
                  }}
                >
                  Confirmar y QR
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
      {mostrarModalQrs && (() => {
        const currentStop = paradasDonacionesActivas[0]
        if (!currentStop) return null

        const codigos = currentStop.donaciones
          .map((donacion) => ({
            donacion,
            codigo: codigosEntrega[donacion.id] ?? (
              donacion.entregaCodigo ? createCodigoEntregaPayload(donacion, donacion.entregaCodigo) : ''
            ),
          }))
          .filter((item) => item.codigo)

        return (
          <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Códigos QR Listos</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">Códigos QR de Entrega</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Enseña estos códigos QR al responsable del puesto para confirmar la recepción de la donación.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarModalQrs(false)}
                  className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 active:scale-95 transition"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                {codigos.map(({ donacion, codigo }) => (
                  <div key={donacion.id} className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-4 shadow-sm flex flex-col items-center gap-3">
                    <QRCodeSVG value={codigo} size={220} level="M" includeMargin />
                    <div className="text-center w-full">
                      <p className="text-sm font-bold text-cyan-950">
                        {donacion.cantidad} {donacion.unidad} de {donacion.producto.nombre}
                      </p>
                      <p className="mt-1 text-xs text-cyan-900 leading-relaxed">
                        Entregar en: <span className="font-semibold text-slate-900">{currentStop.puesto.nombre}</span>
                      </p>
                    </div>

                    {/* Real-time quantity modifier directly inside QR viewer */}
                    <div className="w-full rounded-lg bg-white border border-cyan-100 p-2 flex items-center justify-between mt-1">
                      <div className="text-left text-[11px] text-cyan-900 leading-tight">
                        <p className="font-bold">¿Llevas otra cantidad?</p>
                        <p className="text-[9px] text-slate-400">El QR cambia al instante.</p>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleUpdateDashboardQrQty(donacion.id, -1)
                          }}
                          className="h-7 w-7 rounded bg-white text-slate-700 font-bold hover:bg-slate-100 text-xs flex items-center justify-center border border-slate-200 active:scale-95 transition"
                        >
                          -
                        </button>
                        <span className="px-2 font-bold text-slate-900 text-xs text-center w-12 truncate">
                          {donacion.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleUpdateDashboardQrQty(donacion.id, 1)
                          }}
                          className="h-7 w-7 rounded bg-white text-slate-700 font-bold hover:bg-slate-100 text-xs flex items-center justify-center border border-slate-200 active:scale-95 transition"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  className="py-3 font-bold"
                  onClick={() => setMostrarModalQrs(false)}
                >
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
      {false && (
        <div>
          {cantidad} {comentarioDonacion} {vistaDonacion} {donacionLoading ? 'l' : ''} {cantidadError} {selectedNeed ? 's' : ''} {mensajeDonacion} {typeof setDonacionLoading === 'function' ? 'sl' : ''} {estadoLoadingId} {typeof setWizardMode === 'function' ? 'wm' : ''} {donacionesHistorial ? 'h' : ''}
        </div>
      )}
    </div>
  )
}

type ObjetoDonable = {
  key: string
  producto: ItemInventario['producto']
  necesidades: Necesidad[]
  cantidadTotal: number
}

/*
type SeleccionObjetoDonacion = {
  cantidad: string
  puestoId: string
}
*/

type RutaDonacionMultiparada = {
  puestos: PuestoEmergencia[]
  points: [number, number][]
  distanciaKm: number
  duracionMin: number
  incidenciasEvitadas: number
  incidenciasCercanas: number
}

// ── Arrow SVG used in the navigation compass ──
function FlechaNavegacion({
  icono,
  rotacion,
  grande = false,
}: {
  icono: string
  rotacion: number
  grande?: boolean
}) {
  const size = grande ? 80 : 56
  if (icono === 'destino') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className="mx-auto" aria-hidden>
        <circle cx="40" cy="40" r="28" fill="#16a34a" />
        <text x="40" y="47" textAnchor="middle" fontSize="24" fill="white">★</text>
      </svg>
    )
  }
  if (icono === 'rotonda') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className="mx-auto" aria-hidden>
        <circle cx="40" cy="40" r="28" stroke="#0891b2" strokeWidth="6" fill="none" />
        <path d="M54 30 L62 38 L54 46" stroke="#0891b2" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  return (
    <div className="mx-auto" style={{ transform: `rotate(${rotacion}deg)`, transition: 'transform 0.3s ease', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
        <path d="M40 8 L58 62 L40 50 L22 62 Z" fill="#0891b2" />
      </svg>
    </div>
  )
}
