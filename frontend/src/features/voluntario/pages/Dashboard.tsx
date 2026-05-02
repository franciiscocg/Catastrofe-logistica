import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'
import type { PuestoEmergencia } from '@/types/catastrofe.types'
import type { ItemInventario } from '@/types/inventario.types'
import Map, { type IncidenciaMarker, type PuestoMarker } from '@/components/shared/Map'
import { useGeolocation } from '@/hooks/useGeolocation'
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
  _count?: { comentarios: number }
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
  producto: ItemInventario['producto']
  puesto: PuestoEmergencia
}

type AsignacionPuestoActiva = {
  id: string
  puestoId: string
  estado: 'ACTIVA' | 'FINALIZADA' | 'CANCELADA'
  puesto: PuestoEmergencia
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
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

function ActionCard({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string
  subtitle: string
  icon: string
  onClick: () => void
}) {
  const iconLabel = icon.length <= 2
    ? icon
    : title.includes('donacion')
      ? 'D'
      : title.includes('incidencia')
        ? '!'
        : '+'
  const accent = title.includes('donacion')
    ? {
        wrapper: 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70 hover:border-emerald-300',
        icon: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 group-hover:bg-emerald-600 group-hover:text-white',
        glow: 'bg-emerald-400/10',
      }
    : title.includes('incidencia')
      ? {
          wrapper: 'border-amber-100 bg-gradient-to-br from-white to-amber-50/80 hover:border-amber-300',
          icon: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 group-hover:bg-amber-500 group-hover:text-white',
          glow: 'bg-amber-400/10',
        }
      : {
          wrapper: 'border-sky-100 bg-gradient-to-br from-white to-sky-50/80 hover:border-sky-300',
          icon: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200 group-hover:bg-sky-600 group-hover:text-white',
          glow: 'bg-sky-400/10',
        }

  return (
    <button
      onClick={onClick}
      className={`group relative min-h-40 overflow-hidden rounded-lg border p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${accent.wrapper}`}
    >
      <span className={`absolute -right-8 -top-8 h-24 w-24 rounded-full ${accent.glow}`} />
      <span className={`relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm font-semibold shadow-sm transition-colors ${accent.icon}`}>
        {iconLabel}
      </span>
      <p className="relative mt-5 text-base font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
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
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-700',
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${classes[tone]}`}>
      {children}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function cardClass(selected: boolean, disabled = false) {
  return `rounded-lg border bg-white shadow-sm transition-all ${
    selected
      ? 'border-green-500 ring-2 ring-green-100'
      : disabled
        ? 'border-slate-200 opacity-60'
        : 'border-slate-200 hover:border-green-300 hover:shadow-md'
  }`
}

function isDonacionActiva(donacion: Donacion) {
  return donacion.estado === 'PENDIENTE' || donacion.estado === 'EN_CAMINO'
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
        const [{ data: puestosData }, { data: incidenciasData }, necesidadesResult, misDonacionesResult, asignacionPuestoResult] = await Promise.all([
          apiClient.get('/api/puestos'),
          apiClient.get('/api/incidencias'),
          apiClient.get('/api/donaciones/necesidades').catch(() => ({ data: { necesidades: [] } })),
          apiClient.get('/api/donaciones/mis-donaciones').catch(() => ({ data: { donaciones: [] } })),
          apiClient.get('/api/puestos/mis-asignaciones/activa').catch(() => ({ data: { asignacion: null } })),
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
  const selectedIncidencia = incidencias.find((incidencia) => incidencia.id === seleccion)
  const donacionesActivas = misDonaciones.filter(isDonacionActiva)
  const donacionActiva = donacionesActivas[0]
  const actividadActiva = donacionActiva
    ? {
        tipo: 'donacion' as const,
        id: donacionActiva.id,
        nombre: `${donacionActiva.producto.nombre} para ${donacionActiva.puesto.nombre}`,
      }
    : actividadManualActiva

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
      if (!puesto.id.startsWith('demo-')) {
        await apiClient.post(`/api/puestos/${puesto.id}/asignaciones`)
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
          await apiClient.post(`/api/puestos/${actividadManualActiva.id}/asignaciones/finalizar`)
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
    }
    setActividadManualActiva(null)
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

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-emerald-50 via-sky-50/60 to-white pb-24 safe-bottom">
      <div className="border-b border-emerald-100 bg-white/90 px-4 py-5 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Panel de voluntario</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-800">Centro de actividad</h1>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">Elige, confirma y manten una unica tarea activa.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-right shadow-sm sm:block">
              <p className="text-[11px] font-medium uppercase tracking-wide text-sky-600">Opciones</p>
              <p className="mt-1 text-sm font-semibold text-sky-800">3 actividades</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-right shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Estado</p>
              <div className="mt-1 flex items-center justify-end gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-sm font-semibold text-emerald-800">Disponible</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-5">
        {actividadActiva && (
          <Notice tone="success">
            Actividad en curso: <strong>{actividadActiva.nombre}</strong>. Termina o cancela esta tarea antes de elegir otra.
          </Notice>
        )}
        {accion && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Actividad elegida</p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-800">
                {accion === 'donacion' ? 'Hacer una donacion' : accion === 'incidencia' ? 'Ayudar en incidencia' : 'Ayudar en puesto'}
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
          <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-sm backdrop-blur">
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
      <main className="mx-auto max-w-5xl px-4 pt-5">
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
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-3 py-2 rounded-lg">
                    Tienes una donacion activa para <strong>{donacionActiva.puesto.nombre}</strong>. Puedes añadir mas productos a ese centro, pero no a otro distinto hasta finalizarla.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-emerald-100 bg-white/90 p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('necesidades')}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      vistaDonacion === 'necesidades'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-emerald-50'
                    }`}
                  >
                    Necesidades
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('mis-donaciones')}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      vistaDonacion === 'mis-donaciones'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-emerald-50'
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
                            <div className="space-y-3 border-t border-green-100 bg-green-50/60 p-4">
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
                                      : 'border-gray-300 focus:border-green-500 focus:ring-green-500'
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
                                  className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500 text-sm"
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
                      {donacionesActivas.map((donacion) => (
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
                            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
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
                            <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
                              <div className="border-b border-blue-100 bg-blue-50 px-3 py-3">
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
                                onClick={() => void handleActualizarEstadoDonacion(donacion, 'ENTREGADA')}
                              >
                                Entregada
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
                      ))}
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
                      <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
                        <div className="border-b border-blue-100 bg-blue-50 px-3 py-3">
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

                {incidencias.length === 0 ? (
                  <EmptyState>No hay incidencias registradas ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {incidencias.map((incidencia) => (
                      <button
                        key={incidencia.id}
                        onClick={() => setSeleccion(incidencia.id)}
                        className={`${cardClass(seleccion === incidencia.id)} w-full p-4 text-left`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-800">{incidencia.descripcion || 'Incidencia sin descripcion'}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {incidencia.latitud.toFixed(5)}, {incidencia.longitud.toFixed(5)}
                            </p>
                          </div>
                          <Badge variant={incidencia.estado === 'CORTADA' ? 'danger' : 'success'}>
                            {incidencia.estado === 'CORTADA' ? 'Cortada' : 'Transitable'}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedIncidencia && (
                  <div className="rounded-lg border border-green-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-800">Incidencia seleccionada</p>
                    <p className="mt-1 text-sm text-slate-500">{selectedIncidencia.descripcion || 'Sin descripcion'}</p>
                    <button
                      type="button"
                      onClick={() => handleComoLlegarIncidencia(selectedIncidencia)}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
                      disabled={rutaLoading}
                    >
                      {rutaLoadingId === `incidencia:${selectedIncidencia.id}` ? 'Calculando ruta...' : 'Como llegar'}
                    </button>
                    {rutaError && rutaErrorDonacionId === `incidencia:${selectedIncidencia.id}` && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                        <p>{rutaError}</p>
                        {rutaError.includes('ubicacion') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="mt-2 w-full sm:w-auto"
                            onClick={() => handleComoLlegarIncidencia(selectedIncidencia)}
                          >
                            Compartir ubicacion
                          </Button>
                        )}
                      </div>
                    )}
                    {rutaActiva?.donacionId === `incidencia:${selectedIncidencia.id}` && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
                        <div className="border-b border-blue-100 bg-blue-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-blue-900">Ruta segura a la incidencia</p>
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
                          className="h-72"
                          center={[selectedIncidencia.latitud, selectedIncidencia.longitud]}
                          userPosition={userPosition}
                          onUserLocated={setUserPosition}
                          incidencias={incidencias as IncidenciaMarker[]}
                          route={rutaActiva.points}
                          markerVariant="neutral"
                        />
                      </div>
                    )}
                  {actividadManualActiva?.tipo === 'incidencia' && actividadManualActiva.id === selectedIncidencia.id ? (
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
                        onClick={() => setActividadManualActiva({
                          tipo: 'incidencia',
                          id: selectedIncidencia.id,
                          nombre: selectedIncidencia.descripcion || 'Incidencia sin descripcion',
                        })}
                      >
                        Apuntarme para ayudar
                      </Button>
                    )}
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
                            <div className="border-t border-emerald-100 bg-emerald-50/40 p-4">
                              <p className={`text-xs ${lleno ? 'text-red-600' : 'text-emerald-700'}`}>
                                {lleno
                                  ? 'Este puesto esta lleno ahora mismo.'
                                  : `Quedan ${huecosLibres} hueco${huecosLibres === 1 ? '' : 's'} disponible${huecosLibres === 1 ? '' : 's'}.`}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleComoLlegar(puesto, `puesto:${puesto.id}`)}
                                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-60"
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
                                <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
                                  <div className="border-b border-blue-100 bg-blue-50 px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-blue-900">Ruta segura a {puesto.nombre}</p>
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
