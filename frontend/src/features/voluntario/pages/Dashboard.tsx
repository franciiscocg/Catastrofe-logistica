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
    <div className="border border-dashed border-gray-300 rounded-lg px-4 py-6 text-center text-sm text-gray-500">
      {children}
    </div>
  )
}

function ActionCard({
  active,
  title,
  subtitle,
  icon,
  onClick,
}: {
  active: boolean
  title: string
  subtitle: string
  icon: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`border-2 rounded-lg p-4 text-left transition-colors ${
        active
          ? 'bg-green-50 border-green-500 text-green-900'
          : 'bg-white border-gray-200 text-gray-700 hover:border-green-300'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <p className="font-semibold text-sm mt-2">{title}</p>
      <p className={`text-xs mt-0.5 ${active ? 'text-green-700' : 'text-gray-500'}`}>{subtitle}</p>
    </button>
  )
}

function isDonacionActiva(donacion: Donacion) {
  return donacion.estado === 'PENDIENTE' || donacion.estado === 'EN_CAMINO'
}

export default function VoluntarioDashboard() {
  const [accion, setAccion] = useState<AccionVoluntario>('donacion')
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
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
  const [rutaActiva, setRutaActiva] = useState<{
    puesto: PuestoEmergencia
    points: [number, number][]
    distanciaKm: number
    duracionMin: number
    incidenciasEvitadas: number
    incidenciasCercanas: number
  } | null>(null)
  const [rutaLoading, setRutaLoading] = useState(false)
  const [rutaError, setRutaError] = useState('')
  const { position, request: requestGeo } = useGeolocation()

  useEffect(() => {
    if (position) setUserPosition([position.lat, position.lng])
  }, [position])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [{ data: puestosData }, { data: incidenciasData }, necesidadesResult, misDonacionesResult] = await Promise.all([
          apiClient.get('/api/puestos'),
          apiClient.get('/api/incidencias'),
          apiClient.get('/api/donaciones/necesidades').catch(() => ({ data: { necesidades: [] } })),
          apiClient.get('/api/donaciones/mis-donaciones').catch(() => ({ data: { donaciones: [] } })),
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
  const selectedPuesto = puestos.find((puesto) => puesto.id === seleccion)
  const donacionesActivas = misDonaciones.filter(isDonacionActiva)
  const donacionActiva = donacionesActivas[0]

  const resetSelection = (next: AccionVoluntario) => {
    setAccion(next)
    setSeleccion('')
    setCantidad('')
    setComentarioDonacion('')
    setMensajeDonacion('')
    setErrorDonacion('')
    setCantidadError('')
  }

  const handleComoLlegar = async (puesto: PuestoEmergencia) => {
    setRutaError('')

    if (!userPosition) {
      requestGeo()
      setRutaError('Comparte tu ubicacion para calcular una ruta segura.')
      return
    }

    setRutaLoading(true)
    try {
      const resultado = await fetchRutaEvitandoIncidencias(
        userPosition,
        [puesto.latitud, puesto.longitud],
        incidencias,
      )
      setRutaActiva({ puesto, ...resultado })
    } catch (error) {
      setRutaError(error instanceof Error ? error.message : 'No se pudo calcular la ruta.')
    } finally {
      setRutaLoading(false)
    }
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

  const handleActualizarEstadoDonacion = async (donacion: Donacion, estado: 'EN_CAMINO' | 'CANCELADA') => {
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
      if (estado === 'CANCELADA') {
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
    <div className="h-full overflow-y-auto overscroll-contain pb-24 safe-bottom">
      <div className="bg-green-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Tu estado</p>
        <div className="flex items-center gap-2">
          <p className="font-semibold">Disponible</p>
          <Badge variant="success" className="bg-green-500 text-white">Activo</Badge>
        </div>
      </div>

      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Que quieres hacer ahora?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionCard
            active={accion === 'donacion'}
            icon="📦"
            title="Hacer una donacion"
            subtitle="Elige necesidades por puesto"
            onClick={() => resetSelection('donacion')}
          />
          <ActionCard
            active={accion === 'incidencia'}
            icon="🚧"
            title="Ayudar en incidencia"
            subtitle="Apuntate a un aviso"
            onClick={() => resetSelection('incidencia')}
          />
          <ActionCard
            active={accion === 'puesto'}
            icon="🏪"
            title="Ayudar en puesto"
            subtitle="Unete a un punto de asistencia"
            onClick={() => resetSelection('puesto')}
          />
        </div>
      </div>

      <div className="px-4 pt-5">
        {loading ? (
          <EmptyState>Cargando opciones disponibles...</EmptyState>
        ) : (
          <>
            {accion === 'donacion' && (
              <section className="space-y-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Donaciones</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Elige una necesidad o revisa las donaciones que ya has comprometido.</p>
                </div>

                {mensajeDonacion && (
                  <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg">
                    {mensajeDonacion}
                  </div>
                )}

                {donacionActiva && vistaDonacion === 'necesidades' && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-3 py-2 rounded-lg">
                    Tienes una donacion activa para <strong>{donacionActiva.puesto.nombre}</strong>. Puedes añadir mas productos a ese centro, pero no a otro distinto hasta finalizarla.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('necesidades')}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      vistaDonacion === 'necesidades'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    Necesidades
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaDonacion('mis-donaciones')}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      vistaDonacion === 'mis-donaciones'
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-gray-300 bg-white text-gray-700'
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
                          className={`bg-white border rounded-lg transition-colors ${
                            selected ? 'border-green-500 ring-1 ring-green-500' : bloqueadaPorOtroCentro ? 'border-gray-200 opacity-60' : 'border-gray-200'
                          }`}
                        >
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-gray-900">{item.producto.nombre}</p>
                                <p className="text-sm text-gray-500 mt-0.5">{puesto.nombre}</p>
                                <p className="text-xs text-gray-400 mt-1">{puesto.direccion}</p>
                                {cantidadComprometida !== undefined && (
                                  <p className="text-xs text-gray-500 mt-2">
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
                            <div className="border-t border-green-100 bg-green-50/50 p-4 space-y-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">Vas a llevar {selectedNeed.item.producto.nombre}</p>
                                <p className="text-xs text-gray-500">Destino: {selectedNeed.puesto.nombre}</p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad que puedes llevar</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={selectedNeed.cantidadPendiente ?? selectedNeed.item.cantidad}
                                  step="0.1"
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
                                <p className="mt-1 text-xs text-gray-500">
                                  Maximo disponible: {selectedNeed.cantidadPendiente ?? selectedNeed.item.cantidad} {selectedNeed.item.producto.unidad}
                                </p>
                                {cantidadError && <p className="mt-1 text-xs text-red-600">{cantidadError}</p>}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Comentario opcional</label>
                                <textarea
                                  value={comentarioDonacion}
                                  onChange={(event) => setComentarioDonacion(event.target.value)}
                                  className="w-full rounded-lg border-gray-300 focus:border-green-500 focus:ring-green-500 text-sm"
                                  rows={2}
                                  placeholder="Ej. llego en furgoneta sobre las 18:00"
                                />
                              </div>
                              {errorDonacion && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                                  {errorDonacion}
                                </div>
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
                      <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                        {errorDonacion}
                      </div>
                    )}
                    {donacionesActivas.length === 0 ? (
                      <EmptyState>No tienes donaciones activas ahora mismo.</EmptyState>
                    ) : (
                    <div className="space-y-2">
                      {donacionesActivas.map((donacion) => (
                        <div key={donacion.id} className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {donacion.cantidad} {donacion.unidad} de {donacion.producto.nombre}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{donacion.puesto.nombre}</p>
                            </div>
                            <Badge variant={donacion.estado === 'CANCELADA' ? 'danger' : donacion.estado === 'ENTREGADA' ? 'success' : 'info'}>
                              {donacion.estado.replace('_', ' ')}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleComoLlegar(donacion.puesto)}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                            disabled={rutaLoading}
                          >
                            {rutaLoading ? 'Calculando ruta...' : 'Como llegar'}
                          </button>
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

                    {rutaError && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">
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
                      <div className="mt-3 bg-white border border-blue-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-blue-900">Ruta segura a {rutaActiva.puesto.nombre}</p>
                              <p className="text-xs text-blue-700 mt-0.5">
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
                    )}
                  </div>
                )}
              </section>
            )}

            {accion === 'incidencia' && (
              <section className="space-y-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Incidencias abiertas</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Elige una incidencia en la que puedas ayudar.</p>
                </div>

                {incidencias.length === 0 ? (
                  <EmptyState>No hay incidencias registradas ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-2">
                    {incidencias.map((incidencia) => (
                      <button
                        key={incidencia.id}
                        onClick={() => setSeleccion(incidencia.id)}
                        className={`w-full text-left bg-white border rounded-lg p-4 transition-colors ${
                          seleccion === incidencia.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{incidencia.descripcion || 'Incidencia sin descripcion'}</p>
                            <p className="text-xs text-gray-500 mt-1">
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
                  <div className="bg-white border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-gray-900">Incidencia seleccionada</p>
                    <p className="text-sm text-gray-500 mt-1">{selectedIncidencia.descripcion || 'Sin descripcion'}</p>
                    <Button fullWidth className="mt-3">Apuntarme para ayudar</Button>
                  </div>
                )}
              </section>
            )}

            {accion === 'puesto' && (
              <section className="space-y-3">
                <div>
                  <h2 className="font-semibold text-gray-900">Puestos de asistencia</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Elige un puesto para incorporarte como apoyo.</p>
                </div>

                {puestos.length === 0 ? (
                  <EmptyState>No hay puestos activos ahora mismo.</EmptyState>
                ) : (
                  <div className="space-y-2">
                    {puestos.map((puesto) => (
                      <button
                        key={puesto.id}
                        onClick={() => setSeleccion(puesto.id)}
                        className={`w-full text-left bg-white border rounded-lg p-4 transition-colors ${
                          seleccion === puesto.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{puesto.nombre}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{puesto.direccion}</p>
                            <p className="text-xs text-gray-400 mt-1">{puesto.tipo}</p>
                          </div>
                          <Badge variant="info">Activo</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedPuesto && (
                  <div className="bg-white border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-gray-900">Puesto seleccionado</p>
                    <p className="text-sm text-gray-500 mt-1">{selectedPuesto.nombre}</p>
                    <Button fullWidth className="mt-3">Entrar a ayudar en este puesto</Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
