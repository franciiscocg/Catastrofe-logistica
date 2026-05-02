import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'
import type { PuestoEmergencia } from '@/types/catastrofe.types'
import type { ItemInventario } from '@/types/inventario.types'
import Map, { type IncidenciaMarker, type PuestoMarker } from '@/components/shared/Map'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useConnectivity } from '@/hooks/useConnectivity'
import { useSyncStore } from '@/store/sync.store'
import { fetchRutaEvitandoIncidencias } from '@/utils/routing'

type AccionVoluntario = 'donacion' | 'incidencia' | 'puesto'
type VistaDonacion = 'necesidades' | 'mis-donaciones'
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
  latitud: number
  longitud: number
  estado: 'CORTADA' | 'TRANSITABLE'
  descripcion?: string | null
  createdAt: string
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
  puesto: PuestoEmergencia
}

type AsignacionIncidenciaActiva = {
  id: string
  incidenciaId: string
  estado: 'ACTIVA' | 'FINALIZADA' | 'CANCELADA'
  incidencia: Incidencia
}

const PUESTOS_FALLBACK: PuestoEmergencia[] = [
  {
    id: 'demo-1',
    nombre: 'CEIP La Paz',
    direccion: 'C/ Mayor 12, Valencia',
    latitud: 39.4254,
    longitud: -0.4178,
    tipo: 'Distribucion',
    activo: true,
    catastrofeId: 'demo',
  },
  {
    id: 'demo-2',
    nombre: 'Pabellon Municipal Benetusser',
    direccion: 'Av. del Deportiu 3, Benetusser',
    latitud: 39.4328,
    longitud: -0.3948,
    tipo: 'Asistencia',
    activo: true,
    catastrofeId: 'demo',
  },
  {
    id: 'demo-3',
    nombre: 'Centro Civico Catarroja',
    direccion: "Pl. de l'Ajuntament 1, Catarroja",
    latitud: 39.399,
    longitud: -0.4019,
    tipo: 'Logistica',
    activo: true,
    catastrofeId: 'demo',
  },
]

const NECESIDADES_FALLBACK: Record<string, ItemInventario[]> = {
  'demo-1': [
    necesidadDemo('med-1', 'Medicamentos basicos', 'Sanidad', 'kits', 12, 'critico', 'demo-1'),
    necesidadDemo('ropa-1', 'Ropa de abrigo', 'Ropa', 'prendas', 40, 'bajo', 'demo-1'),
  ],
  'demo-2': [
    necesidadDemo('alim-1', 'Alimentos infantiles', 'Alimentacion', 'unidades', 60, 'critico', 'demo-2'),
    necesidadDemo('hig-1', 'Productos de higiene', 'Higiene', 'kits', 25, 'bajo', 'demo-2'),
  ],
  'demo-3': [
    necesidadDemo('herr-1', 'Herramientas de limpieza', 'Herramientas', 'unidades', 18, 'medio', 'demo-3'),
  ],
}

function necesidadDemo(
  id: string,
  nombre: string,
  categoria: string,
  unidad: string,
  cantidad: number,
  nivelStock: ItemInventario['nivelStock'],
  puestoId: string,
): ItemInventario {
  return {
    id,
    puestoId,
    producto: { id, nombre, categoria, unidad },
    cantidad,
    tipo: 'necesario',
    nivelStock,
    updatedAt: new Date().toISOString(),
  }
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  )
}

const actionMeta = {
  donacion: {
    label: 'Donacion',
    title: 'Hacer una donacion',
    short: 'Donar',
    mark: 'D',
    accent: 'cyan',
    classes: {
      wrapper: 'border-cyan-200 bg-white hover:border-cyan-400 hover:shadow-cyan-950/10',
      mark: 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200',
      line: 'bg-cyan-500',
    },
  },
  incidencia: {
    label: 'Incidencia',
    title: 'Ayudar en incidencia',
    short: 'Incidencia',
    mark: '!',
    accent: 'amber',
    classes: {
      wrapper: 'border-amber-200 bg-white hover:border-amber-400 hover:shadow-amber-950/10',
      mark: 'bg-amber-500 text-white',
      line: 'bg-amber-500',
    },
  },
  puesto: {
    label: 'Puesto',
    title: 'Ayudar en puesto',
    short: 'Puesto',
    mark: 'P',
    accent: 'indigo',
    classes: {
      wrapper: 'border-indigo-200 bg-white hover:border-indigo-400 hover:shadow-indigo-950/10',
      mark: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
      line: 'bg-indigo-500',
    },
  },
} satisfies Record<AccionVoluntario, {
  label: string
  title: string
  short: string
  mark: string
  accent: string
  classes: { wrapper: string; mark: string; line: string }
}>

function ActionCard({
  type,
  title,
  icon: _icon,
  subtitle,
  onClick,
}: {
  type?: AccionVoluntario
  title?: string
  icon?: string
  subtitle: string
  onClick: () => void
}) {
  const inferredType: AccionVoluntario = type ?? (
    title?.includes('incidencia') ? 'incidencia' : title?.includes('puesto') ? 'puesto' : 'donacion'
  )
  const meta = actionMeta[inferredType]

  return (
    <button
      onClick={onClick}
      className={`group relative min-h-44 overflow-hidden rounded-lg border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${meta.classes.wrapper}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${meta.classes.line}`} />
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold shadow-sm ${meta.classes.mark}`}>
        {meta.mark}
      </span>
      <p className="mt-5 text-base font-semibold text-slate-950">{meta.title}</p>
      <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>
      <span className="mt-5 inline-flex items-center text-sm font-semibold text-slate-700 transition-colors group-hover:text-slate-950">
        Abrir
        <span className="ml-2 transition-transform group-hover:translate-x-1">-&gt;</span>
      </span>
    </button>
  )
}

function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  const classes = {
    info: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
  }

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm shadow-sm ${classes[tone]}`}>
      {children}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase text-slate-400">Modulo operativo</p>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      </div>
      <p className="max-w-xl text-sm leading-5 text-slate-500 sm:text-right">{subtitle}</p>
    </div>
  )
}

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
    type: 'DONACION_ENTREGA',
    version: 1,
    entregaCodigo,
    donacionId: donacion.id,
    puestoId: donacion.puesto.id,
    productoId: donacion.producto.id,
    cantidad: donacion.cantidad,
    unidad: donacion.unidad,
    generatedAt: new Date().toISOString(),
  })
}

function createOfflineEntregaCodigo(donacionId: string) {
  return `OFFLINE-${donacionId}-${Date.now()}`
}

function RouteSafetyPanel({
  distanciaKm,
  duracionMin,
  incidenciasEvitadas,
  incidenciasCercanas,
  destino,
}: {
  distanciaKm: number
  duracionMin: number
  incidenciasEvitadas: number
  incidenciasCercanas: number
  destino: string
}) {
  const riesgo = incidenciasCercanas > 0 || incidenciasEvitadas > 0

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md bg-slate-50 px-2 py-2">
          <p className="font-medium text-slate-500">Distancia</p>
          <p className="mt-1 font-semibold text-slate-800">{distanciaKm.toFixed(1)} km</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-2">
          <p className="font-medium text-slate-500">Tiempo</p>
          <p className="mt-1 font-semibold text-slate-800">~{duracionMin} min</p>
        </div>
        <div className={`rounded-md px-2 py-2 ${riesgo ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <p className={`font-medium ${riesgo ? 'text-amber-700' : 'text-emerald-700'}`}>Seguridad</p>
          <p className={`mt-1 font-semibold ${riesgo ? 'text-amber-900' : 'text-emerald-900'}`}>
            {riesgo ? `${incidenciasCercanas} aviso${incidenciasCercanas === 1 ? '' : 's'} cerca` : 'Ruta sin avisos'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { window.location.href = 'tel:112' }}
          className="rounded-md bg-red-50 px-2 py-2 text-left transition-colors hover:bg-red-100"
        >
          <p className="font-medium text-red-700">Emergencia</p>
          <p className="mt-1 font-semibold text-red-900">Llamar 112</p>
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Destino: {destino}. Si la ruta cambia o detectas peligro, avisa al puesto al llegar.
      </p>
    </div>
  )
}

function ocupacionInicialPuesto(puesto: PuestoEmergencia, index: number): OcupacionPuesto {
  const fallback: Record<string, OcupacionPuesto> = {
    'demo-1': { capacidad: 6, trabajando: 4 },
    'demo-2': { capacidad: 4, trabajando: 4 },
    'demo-3': { capacidad: 8, trabajando: 2 },
  }
  const base = fallback[puesto.id] ?? {
    capacidad: puesto.capacidadTrabajo ?? 4 + (index % 3) * 2,
    trabajando: puesto.voluntariosTrabajando ?? Math.min(3 + index, 4 + (index % 3) * 2),
  }

  return {
    capacidad: Math.max(1, Math.trunc(base.capacidad)),
    trabajando: Math.max(0, Math.min(Math.trunc(base.trabajando), Math.max(1, Math.trunc(base.capacidad)))),
  }
}

export default function VoluntarioDashboard() {
  const [accion, setAccion] = useState<AccionVoluntario | null>(null)
  const [puestos, setPuestos] = useState<PuestoEmergencia[]>([])
  const [inventarioPorPuesto, setInventarioPorPuesto] = useState<Record<string, ItemInventario[]>>({})
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [necesidadesApi, setNecesidadesApi] = useState<Necesidad[]>([])
  const [misDonaciones, setMisDonaciones] = useState<Donacion[]>([])
  const [loading, setLoading] = useState(true)
  const [seleccion, setSeleccion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [comentarioDonacion, setComentarioDonacion] = useState('')
  const [vistaDonacion, setVistaDonacion] = useState<VistaDonacion>('necesidades')
  const [donacionLoading, setDonacionLoading] = useState(false)
  const [estadoLoadingId, setEstadoLoadingId] = useState('')
  const [mensajeDonacion, setMensajeDonacion] = useState('')
  const [errorDonacion, setErrorDonacion] = useState('')
  const [cantidadError, setCantidadError] = useState('')
  const [codigosEntrega, setCodigosEntrega] = useState<Record<string, string>>({})
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
  const { position, request: requestGeo } = useGeolocation()
  const { mode, isOnline } = useConnectivity()
  const enqueueSync = useSyncStore((store) => store.enqueue)
  const pendingSync = useSyncStore((store) => store.pendingCount)

  useEffect(() => {
    if (position) setUserPosition([position.lat, position.lng])
  }, [position])

  useEffect(() => {
    if (!userPosition || !rutaPendiente) return

    const pendiente = rutaPendiente
    setRutaPendiente(null)
    void handleComoLlegar(pendiente.puesto, pendiente.donacionId, pendiente.excluirIncidenciaId)
  }, [rutaPendiente, userPosition])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [{ data: puestosData }, { data: incidenciasData }, necesidadesResult, misDonacionesResult, asignacionPuestoResult, asignacionIncidenciaResult] = await Promise.all([
          apiClient.get('/api/puestos'),
          apiClient.get('/api/incidencias'),
          apiClient.get('/api/donaciones/necesidades').catch(() => ({ data: { necesidades: [] } })),
          apiClient.get('/api/donaciones/mis-donaciones').catch(() => ({ data: { donaciones: [] } })),
          apiClient.get('/api/puestos/mis-asignaciones/activa').catch(() => ({ data: { asignacion: null } })),
          apiClient.get('/api/incidencias/mis-asignaciones/activa').catch(() => ({ data: { asignacion: null } })),
        ])

        const apiNecesidades: NecesidadDonacionApi[] = necesidadesResult.data.necesidades ?? []
        const loadedPuestos: PuestoEmergencia[] = puestosData.puestos?.length || apiNecesidades.length > 0
          ? puestosData.puestos ?? []
          : PUESTOS_FALLBACK

        const inventarios = await Promise.all(
          loadedPuestos.map(async (puesto) => {
            if (puesto.id.startsWith('demo-')) return [puesto.id, NECESIDADES_FALLBACK[puesto.id] ?? []] as const

            const { data } = await apiClient.get(`/api/inventario/puesto/${puesto.id}`)
            return [puesto.id, data.inventario ?? []] as const
          }),
        )

        if (!cancelled) {
          setPuestos(loadedPuestos)
          setOcupacionPorPuesto((current) => ({
            ...Object.fromEntries(loadedPuestos.map((puesto, index) => [puesto.id, ocupacionInicialPuesto(puesto, index)] as const)),
            ...current,
          }))
          const asignacionActiva = asignacionPuestoResult.data.asignacion as AsignacionPuestoActiva | null
          if (asignacionActiva?.puesto) {
            setActividadManualActiva({
              tipo: 'puesto',
              id: asignacionActiva.puestoId,
              nombre: asignacionActiva.puesto.nombre,
            })
          }
          const asignacionIncidenciaActiva = asignacionIncidenciaResult.data.asignacion as AsignacionIncidenciaActiva | null
          if (asignacionIncidenciaActiva?.incidencia) {
            setActividadManualActiva({
              tipo: 'incidencia',
              id: asignacionIncidenciaActiva.incidenciaId,
              nombre: asignacionIncidenciaActiva.incidencia.descripcion || 'Incidencia sin descripcion',
            })
          }
          setInventarioPorPuesto(Object.fromEntries(inventarios))
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
        }
      } catch {
        if (!cancelled) {
          setPuestos(PUESTOS_FALLBACK)
          setOcupacionPorPuesto(Object.fromEntries(PUESTOS_FALLBACK.map((puesto, index) => [puesto.id, ocupacionInicialPuesto(puesto, index)] as const)))
          setInventarioPorPuesto(NECESIDADES_FALLBACK)
          setIncidencias([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const necesidades = useMemo<Necesidad[]>(() => (
    necesidadesApi.length > 0 ? necesidadesApi.filter((necesidad) => necesidad.item.cantidad > 0) :
    puestos.flatMap((puesto) => (
      (inventarioPorPuesto[puesto.id] ?? [])
        .filter((item) => item.tipo === 'necesario')
        .map((item) => ({ puesto, item }))
    ))
  ), [inventarioPorPuesto, necesidadesApi, puestos])

  const selectedNeed = necesidades.find((necesidad) => necesidad.item.id === seleccion)
  const donacionesActivas = misDonaciones.filter(isDonacionActiva)
  const donacionesHistorial = misDonaciones.filter((donacion) => !isDonacionActiva(donacion))
  const donacionActiva = donacionesActivas[0]
  const actividadActiva = donacionActiva
    ? {
        tipo: 'donacion' as const,
        id: donacionActiva.id,
        nombre: `${donacionActiva.producto.nombre} para ${donacionActiva.puesto.nombre}`,
      }
    : actividadManualActiva
  const estadoOperativo = actividadActiva ? 'En servicio' : 'Disponible'
  const connectionLabel = mode === 'offline' ? 'Offline' : mode === 'slow' ? 'Conexion lenta' : 'Online'

  const resetSelection = (next: AccionVoluntario) => {
    if (actividadActiva && actividadActiva.tipo !== next) return
    setAccion(next)
    setSeleccion('')
    setCantidad('')
    setComentarioDonacion('')
    setMensajeDonacion('')
    setErrorDonacion('')
    setCantidadError('')
  }

  useEffect(() => {
    if (!donacionActiva) return
    setAccion('donacion')
    setVistaDonacion('mis-donaciones')
  }, [donacionActiva?.id])

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

  const iniciarAyudaPuesto = async (puesto: PuestoEmergencia) => {
    const ocupacion = ocupacionPorPuesto[puesto.id] ?? ocupacionInicialPuesto(puesto, 0)
    if (ocupacion.trabajando >= ocupacion.capacidad || actividadActiva) return

    setErrorDonacion('')
    try {
      if (!isOnline && !puesto.id.startsWith('demo-')) {
        await enqueueSync({
          entity: 'asignacion-puesto',
          method: 'POST',
          url: `/api/puestos/${puesto.id}/asignaciones`,
          priority: 'high',
        })
      }

      if (!puesto.id.startsWith('demo-')) {
        if (isOnline) await apiClient.post(`/api/puestos/${puesto.id}/asignaciones`)
      }

      setOcupacionPorPuesto((current) => ({
        ...current,
        [puesto.id]: {
          capacidad: ocupacion.capacidad,
          trabajando: Math.min(ocupacion.trabajando + 1, ocupacion.capacidad),
        },
      }))
      setActividadManualActiva({
        tipo: 'puesto',
        id: puesto.id,
        nombre: puesto.nombre,
      })
      if (!isOnline) setMensajeDonacion('Sin conexion: asignacion al puesto guardada para sincronizar.')
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo reservar el hueco en el puesto.')
    }
  }

  const finalizarAyudaManual = async () => {
    setErrorDonacion('')
    if (actividadManualActiva?.tipo === 'puesto') {
      if (!actividadManualActiva.id.startsWith('demo-')) {
        try {
          if (isOnline) {
            await apiClient.post(`/api/puestos/${actividadManualActiva.id}/asignaciones/finalizar`)
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
      if (!actividadManualActiva.id.startsWith('demo-')) {
        try {
          if (isOnline) {
            await apiClient.post(`/api/incidencias/${actividadManualActiva.id}/asignaciones/finalizar`)
          } else {
            await enqueueSync({
              entity: 'asignacion-incidencia',
              method: 'POST',
              url: `/api/incidencias/${actividadManualActiva.id}/asignaciones/finalizar`,
              priority: 'high',
            })
            setMensajeDonacion('Sin conexion: finalizacion de incidencia guardada para sincronizar.')
          }
        } catch (err: unknown) {
          const message = err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
            : undefined
          setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo finalizar la ayuda en la incidencia.')
          return
        }
      }
    }
    setActividadManualActiva(null)
  }

  const iniciarAyudaIncidencia = async (incidencia: Incidencia) => {
    if (actividadActiva) return

    setErrorDonacion('')
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
        nombre: incidencia.descripcion || 'Incidencia sin descripcion',
      })
      if (!isOnline) setMensajeDonacion('Sin conexion: asignacion a incidencia guardada para sincronizar.')
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo reservar la ayuda en la incidencia.')
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
      catastrofeId: 'incidencia',
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

    if (donacionActiva && donacionActiva.puesto.id !== selectedNeed.puesto.id) {
      setErrorDonacion(`Ya tienes una donacion activa para ${donacionActiva.puesto.nombre}. Finalizala o cancelala antes de comprometerte con otro centro.`)
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

      if (selectedNeed.puesto.id.startsWith('demo-')) {
        setErrorDonacion('Estas viendo datos demo. Recarga cuando haya necesidades reales para registrar una donacion.')
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
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se ha podido registrar la donacion.')
    } finally {
      setDonacionLoading(false)
    }
  }

  const handleActualizarEstadoDonacion = async (donacion: Donacion, estado: 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA') => {
    if (donacion.id.startsWith('demo-')) {
      setMisDonaciones((current) => current.map((item) => (
        item.id === donacion.id ? { ...item, estado } : item
      )))
      return
    }

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
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo actualizar la donacion.')
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
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setErrorDonacion(message?.error ?? message?.message ?? 'No se pudo generar el codigo de entrega.')
    } finally {
      setEstadoLoadingId('')
    }
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-slate-50 pb-24 text-slate-900 safe-bottom">
      <div className="border-b border-cyan-100 bg-white px-4 py-6 shadow-sm">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-700">Panel de voluntario</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Centro de actividad</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Coordina donaciones, incidencias y apoyo en puestos manteniendo una unica actividad operativa.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
              <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase text-cyan-700">Estado</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{estadoOperativo}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Conexion</p>
                <p className={`mt-1 text-sm font-semibold ${mode === 'offline' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {connectionLabel}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Activas</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{donacionesActivas.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Sincronizacion</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{pendingSync}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        {actividadActiva && (
          <Notice tone="success">
            Actividad en curso: <strong>{actividadActiva.nombre}</strong>. Termina o cancela esta tarea antes de elegir otra.
          </Notice>
        )}
        {accion && (
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
        {!accion && (
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

      {accion && (
      <main className="mx-auto max-w-6xl px-4 pt-5">
        {loading ? (
          <EmptyState>Cargando opciones disponibles...</EmptyState>
        ) : (
          <>
            {accion === 'donacion' && (
              <section className="space-y-3">
                <SectionHeader
                  title="Donaciones"
                  subtitle="Elige una necesidad o revisa las donaciones que ya has comprometido."
                />

                {mensajeDonacion && (
                  <Notice tone="success">{mensajeDonacion}</Notice>
                )}

                {donacionActiva && vistaDonacion === 'necesidades' && (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 shadow-sm">
                    Tienes una donacion activa para <strong>{donacionActiva.puesto.nombre}</strong>. Puedes añadir mas productos a ese centro, pero no a otro distinto hasta finalizarla.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-200 p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('necesidades')}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      vistaDonacion === 'necesidades'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    Necesidades
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('mis-donaciones')}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      vistaDonacion === 'mis-donaciones'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    Mis donaciones ({donacionesActivas.length})
                  </button>
                </div>

                {vistaDonacion === 'necesidades' && necesidades.length === 0 ? (
                  <EmptyState>No hay necesidades publicadas ahora mismo.</EmptyState>
                ) : vistaDonacion === 'necesidades' ? (
                  <div className="space-y-2">
                    {necesidades.map(({ puesto, item, cantidadNecesaria, cantidadComprometida }) => {
                      const selected = seleccion === item.id
                      const bloqueadaPorOtroCentro = Boolean(donacionActiva && donacionActiva.puesto.id !== puesto.id)

                      return (
                        <div
                          key={item.id}
                          className={cardClass(selected, bloqueadaPorOtroCentro)}
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-800">{item.producto.nombre}</p>
                                <p className="mt-1 text-sm font-medium text-slate-600">{puesto.nombre}</p>
                                <p className="mt-1 text-xs text-slate-400">{puesto.direccion}</p>
                                {cantidadComprometida !== undefined && (
                                  <p className="mt-3 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
                                    Necesario: {cantidadNecesaria} {item.producto.unidad}
                                    {' '}· En camino: {cantidadComprometida} {item.producto.unidad}
                                  </p>
                                )}
                              </div>
                              <Badge variant={item.nivelStock === 'critico' ? 'danger' : 'warning'}>
                                {item.cantidad} {item.producto.unidad}
                              </Badge>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant={selected ? 'secondary' : 'primary'}
                              className="mt-3"
                              disabled={bloqueadaPorOtroCentro}
                              onClick={() => {
                                setSeleccion(item.id)
                                setCantidad('')
                                setComentarioDonacion('')
                                setMensajeDonacion('')
                                setErrorDonacion('')
                                setCantidadError('')
                              }}
                            >
                              {bloqueadaPorOtroCentro ? 'Bloqueado por donacion activa' : selected ? 'Seleccionado' : 'Llevar esto'}
                            </Button>
                            {bloqueadaPorOtroCentro && (
                              <p className="text-xs text-gray-500 mt-2">
                                Termina la donacion activa en {donacionActiva?.puesto.nombre} para poder elegir otro centro.
                              </p>
                            )}
                          </div>

                          {selected && selectedNeed && (
                            <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">Vas a llevar {selectedNeed.item.producto.nombre}</p>
                                <p className="text-xs text-slate-500">Destino: {selectedNeed.puesto.nombre}</p>
                              </div>
                              <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad que puedes llevar</label>
                                <input
                                  type="number"
                                  min="1"
                                  max={selectedNeed.cantidadPendiente ?? selectedNeed.item.cantidad}
                                  step="1"
                                  value={cantidad}
                                  onChange={(event) => {
                                    setCantidad(event.target.value)
                                    setCantidadError('')
                                    setErrorDonacion('')
                                  }}
                                  className={`w-full rounded-lg text-sm ${
                                    cantidadError
                                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                      : 'border-gray-300 focus:border-slate-900 focus:ring-slate-900'
                                  }`}
                                  placeholder={`Ej. 10 ${selectedNeed.item.producto.unidad}`}
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  Maximo disponible: {selectedNeed.cantidadPendiente ?? selectedNeed.item.cantidad} {selectedNeed.item.producto.unidad}
                                </p>
                                {cantidadError && <p className="mt-1 text-xs text-red-600">{cantidadError}</p>}
                              </div>
                              <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Comentario opcional</label>
                                <textarea
                                  value={comentarioDonacion}
                                  onChange={(event) => setComentarioDonacion(event.target.value)}
                                  className="w-full rounded-lg border-gray-300 text-sm focus:border-slate-900 focus:ring-slate-900"
                                  rows={2}
                                  placeholder="Ej. llego en furgoneta sobre las 18:00"
                                />
                              </div>
                              {errorDonacion && (
                                <Notice tone="danger">{errorDonacion}</Notice>
                              )}
                              <Button fullWidth loading={donacionLoading} onClick={handleCrearDonacion}>
                                Confirmar donacion
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div>
                    {errorDonacion && (
                      <Notice tone="danger">{errorDonacion}</Notice>
                    )}
                    {donacionesActivas.length === 0 ? (
                      <EmptyState>No tienes donaciones activas ahora mismo.</EmptyState>
                    ) : (
                    <div className="space-y-3">
                      {donacionesActivas.map((donacion) => {
                        const codigoEntrega = codigosEntrega[donacion.id] ?? (
                          donacion.entregaCodigo ? createCodigoEntregaPayload(donacion, donacion.entregaCodigo) : ''
                        )

                        return (
                        <div key={donacion.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {donacion.cantidad} {donacion.unidad} de {donacion.producto.nombre}
                              </p>
                              <p className="mt-1 text-xs font-medium text-slate-500">{donacion.puesto.nombre}</p>
                            </div>
                            <Badge variant={donacion.estado === 'CANCELADA' ? 'danger' : donacion.estado === 'ENTREGADA' ? 'success' : 'info'}>
                              {donacion.estado.replace('_', ' ')}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleComoLlegar(donacion.puesto, donacion.id)}
                            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-800"
                            disabled={rutaLoading}
                          >
                            {rutaLoadingId === donacion.id ? 'Calculando ruta...' : 'Como llegar'}
                          </button>
                          {rutaError && rutaErrorDonacionId === donacion.id && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                              <p>{rutaError}</p>
                              {rutaError.includes('ubicacion') && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="mt-2 w-full sm:w-auto"
                                  onClick={() => {
                                    setRutaPendiente({ puesto: donacion.puesto, donacionId: donacion.id })
                                    requestGeo()
                                  }}
                                >
                                  Compartir ubicacion
                                </Button>
                              )}
                            </div>
                          )}
                          {rutaActiva?.donacionId === donacion.id && (
                            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                              <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-950">Ruta segura a {rutaActiva.puesto.nombre}</p>
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
                                center={[rutaActiva.puesto.latitud, rutaActiva.puesto.longitud]}
                                userPosition={userPosition}
                                onUserLocated={setUserPosition}
                                puestos={puestoRutaMarker}
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
                          {codigoEntrega && (
                            <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
                              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                                <div className="rounded-lg border border-cyan-100 bg-white p-3 shadow-sm">
                                  <QRCodeSVG value={codigoEntrega} size={164} level="M" includeMargin />
                                </div>
                                <div className="text-center sm:text-left">
                                  <p className="text-sm font-semibold text-cyan-950">Codigo de entrega</p>
                                  <p className="mt-1 text-sm text-cyan-900">
                                    Enseña este QR al personal del puesto para que confirme la recepcion.
                                  </p>
                                  <p className="mt-2 break-all rounded-md bg-white/80 px-2 py-1 font-mono text-xs text-cyan-950">
                                    {donacion.id}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {donacion.estado === 'PENDIENTE' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                loading={estadoLoadingId === donacion.id}
                                onClick={() => void handleActualizarEstadoDonacion(donacion, 'EN_CAMINO')}
                              >
                                En camino
                              </Button>
                            )}
                            {donacion.estado === 'EN_CAMINO' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                loading={estadoLoadingId === donacion.id}
                                onClick={() => void handleGenerarCodigoEntrega(donacion)}
                              >
                                {codigoEntrega ? 'Mostrar codigo' : 'Generar codigo'}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              loading={estadoLoadingId === donacion.id}
                              onClick={() => void handleActualizarEstadoDonacion(donacion, 'CANCELADA')}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                    )}

                    {donacionesHistorial.length > 0 && (
                      <div className="mt-5">
                        <SectionHeader
                          title="Historial"
                          subtitle="Ultimas donaciones cerradas o canceladas."
                        />
                        <div className="mt-3 space-y-2">
                          {donacionesHistorial.slice(0, 8).map((donacion) => (
                            <div key={donacion.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {donacion.cantidad} {donacion.unidad} de {donacion.producto.nombre}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">{donacion.puesto.nombre}</p>
                                  {donacion.entregaCodigoGeneradoAt && (
                                    <p className="mt-1 text-xs text-slate-400">
                                      Codigo generado: {new Date(donacion.entregaCodigoGeneradoAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                                <Badge variant={donacion.estado === 'ENTREGADA' ? 'success' : 'danger'}>
                                  {donacion.estado.replace('_', ' ')}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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

                {incidencias.length === 0 ? (
                  <EmptyState>No hay incidencias registradas ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {incidencias.map((incidencia) => {
                      const selected = seleccion === incidencia.id
                      const incidenciaActiva = actividadManualActiva?.tipo === 'incidencia' && actividadManualActiva.id === incidencia.id

                      return (
                        <div key={incidencia.id} className={cardClass(selected)}>
                          <button
                            type="button"
                            onClick={() => setSeleccion(selected ? '' : incidencia.id)}
                            className="w-full p-4 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{incidencia.descripcion || 'Incidencia sin descripcion'}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {incidencia.latitud.toFixed(5)}, {incidencia.longitud.toFixed(5)}
                                </p>
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
                              <p className="mt-1 text-sm text-slate-600">{incidencia.descripcion || 'Sin descripcion'}</p>
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
                                  onClick={finalizarAyudaManual}
                                >
                                  Terminar ayuda en incidencia
                                </Button>
                              ) : (
                                <Button
                                  fullWidth
                                  className="mt-3"
                                  disabled={Boolean(actividadActiva)}
                                  onClick={() => void iniciarAyudaIncidencia(incidencia)}
                                >
                                  Apuntarme para ayudar
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
                                {lleno
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
                                  disabled={Boolean(actividadActiva) || lleno}
                                  onClick={() => void iniciarAyudaPuesto(puesto)}
                                >
                                  {lleno ? 'Puesto lleno' : 'Entrar a ayudar en este puesto'}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      )}
    </div>
  )
}
