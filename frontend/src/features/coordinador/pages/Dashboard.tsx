import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Map from '@/components/shared/Map'
import { apiClient } from '@/lib/api/client'

type SolicitudEstado = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
type PuestoEstado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
type EstadoOperativo = 'OPERATIVO' | 'SATURADO' | 'SIN_RECURSOS' | 'NECESITA_VOLUNTARIOS' | 'CERRADO'
type Vista = 'puestos' | 'solicitudes' | 'mapa'
type FiltroPuestos = 'todos' | 'activos' | 'inactivos' | 'con-peticiones'

interface SolicitudPuesto {
  id: string
  nombre: string
  descripcion?: string | null
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  estado: SolicitudEstado
  motivoRechazo?: string | null
  createdAt: string
  usuario: {
    nombre: string
    apellidos: string
    email: string
    telefono?: string | null
    dni?: string | null
  }
}

interface PuestoCoordinador {
  id: string
  nombre: string
  descripcion?: string | null
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
  estadoSolicitud: PuestoEstado
  motivoRechazo?: string | null
  capacidadTrabajo: number
  voluntariosActivos: number
  responsables: number
  personasTotales: number
  solicitudesPendientes: number
  necesidades: number
  estadoOperativo: EstadoOperativo
  catastrofe: {
    nombre: string
    fase: string
  }
  admin: {
    nombre: string
    apellidos: string
    email: string
    telefono?: string | null
  }
}

interface PuestoDetalle {
  puesto: PuestoCoordinador
  inventario: Array<{
    id: string
    cantidad: number
    tipo: 'DISPONIBLE' | 'NECESARIO'
    producto: { nombre: string; categoria: string; unidad: string }
  }>
  participantes: Array<{
    id: string
    usuario: { nombre: string; apellidos: string; email: string; telefono?: string | null }
    startedAt: string
  }>
  solicitudesParticipacion: Array<{
    id: string
    estado: SolicitudEstado
    motivoRechazo?: string | null
    usuario: { nombre: string; apellidos: string; email: string; telefono?: string | null }
    createdAt: string
  }>
  donaciones: Array<{
    id: string
    cantidad: number
    unidad: string
    estado: 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'
    producto: { nombre: string }
    voluntario: { usuario: { nombre: string; apellidos: string; email: string } }
  }>
  actividad: Array<{
    id: string
    accion: string
    createdAt: string
    usuario?: { nombre: string; apellidos: string; email: string } | null
  }>
}

interface PuestoForm {
  nombre: string
  direccion: string
  tipo: string
  descripcion: string
  latitud: string
  longitud: string
  capacidadTrabajo: string
  activo: boolean
}

function estadoSolicitudBadge(estado: SolicitudEstado) {
  if (estado === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  if (estado === 'ACEPTADA') return <Badge variant="success">Aceptada</Badge>
  return <Badge variant="danger">Rechazada</Badge>
}

function estadoPuestoBadge(puesto: PuestoCoordinador) {
  if (!puesto.activo) return <Badge variant="default">Inactivo</Badge>
  if (puesto.estadoSolicitud === 'APROBADO') return <Badge variant="success">Operativo</Badge>
  if (puesto.estadoSolicitud === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  return <Badge variant="danger">Rechazado</Badge>
}

function estadoOperativoBadge(estado: EstadoOperativo) {
  if (estado === 'OPERATIVO') return <Badge variant="success">Operativo</Badge>
  if (estado === 'SATURADO') return <Badge variant="warning">Saturado</Badge>
  if (estado === 'SIN_RECURSOS') return <Badge variant="danger">Sin recursos</Badge>
  if (estado === 'NECESITA_VOLUNTARIOS') return <Badge variant="info">Necesita voluntarios</Badge>
  return <Badge variant="default">Cerrado</Badge>
}

function puestoToForm(puesto: PuestoCoordinador): PuestoForm {
  return {
    nombre: puesto.nombre,
    direccion: puesto.direccion,
    tipo: puesto.tipo,
    descripcion: puesto.descripcion ?? '',
    latitud: String(puesto.latitud),
    longitud: String(puesto.longitud),
    capacidadTrabajo: String(puesto.capacidadTrabajo),
    activo: puesto.activo,
  }
}

function parseApiError(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
    ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? fallback
}

export default function CoordinadorDashboard() {
  const queryClient = useQueryClient()
  const [vista, setVista] = useState<Vista>('puestos')
  const [filtro, setFiltro] = useState<FiltroPuestos>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [rechazoId, setRechazoId] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [editando, setEditando] = useState<PuestoCoordinador | null>(null)
  const [eliminando, setEliminando] = useState<PuestoCoordinador | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [form, setForm] = useState<PuestoForm | null>(null)
  const [actionError, setActionError] = useState('')
  const [detailError, setDetailError] = useState('')

  const { data: solicitudes = [], isLoading: isLoadingSolicitudes } = useQuery({
    queryKey: ['solicitudes-puesto'],
    queryFn: () =>
      apiClient
        .get<{ solicitudes: SolicitudPuesto[] }>('/api/puestos/solicitudes')
        .then((r) => r.data.solicitudes),
  })

  const {
    data: puestos = [],
    isLoading: isLoadingPuestos,
    isError: isErrorPuestos,
  } = useQuery({
    queryKey: ['puestos-coordinador'],
    queryFn: () =>
      apiClient
        .get<{ puestos: PuestoCoordinador[] }>('/api/puestos/coordinador')
        .then((r) => r.data.puestos),
  })

  const {
    data: detalle,
    isLoading: isLoadingDetalle,
  } = useQuery({
    queryKey: ['puesto-detalle-coordinador', detalleId],
    enabled: Boolean(detalleId),
    queryFn: () =>
      apiClient
        .get<PuestoDetalle>(`/api/puestos/coordinador/${detalleId}/detalle`)
        .then((r) => r.data),
  })

  const invalidateGestion = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitudes-puesto'] })
    queryClient.invalidateQueries({ queryKey: ['puestos-coordinador'] })
  }

  const aceptar = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/puestos/solicitudes/${id}/aceptar`),
    onSuccess: () => {
      setActionError('')
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo aceptar la solicitud')),
  })

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      apiClient.post(`/api/puestos/solicitudes/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      setActionError('')
      setRechazoId(null)
      setMotivoRechazo('')
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo rechazar la solicitud')),
  })

  const guardarPuesto = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch(`/api/puestos/coordinador/${id}`, data),
    onSuccess: () => {
      setActionError('')
      setEditando(null)
      setForm(null)
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo guardar el puesto')),
  })

  const eliminarPuesto = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/puestos/coordinador/${id}`),
    onSuccess: () => {
      setActionError('')
      setEliminando(null)
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo eliminar el puesto')),
  })

  const aceptarParticipacion = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/puestos/coordinador/participaciones/${id}/aceptar`, {}),
    onSuccess: () => {
      setActionError('')
      setDetailError('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo aceptar la participacion')),
  })

  const rechazarParticipacion = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/puestos/coordinador/participaciones/${id}/rechazar`, {}),
    onSuccess: () => {
      setActionError('')
      setDetailError('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo rechazar la participacion')),
  })

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE')
  const puestosActivos = puestos.filter((puesto) => puesto.activo && puesto.estadoSolicitud === 'APROBADO')
  const personasEnPuestos = puestosActivos.reduce((total, puesto) => total + puesto.personasTotales, 0)
  const solicitudesParticipacionPendientes = puestos.reduce((total, puesto) => total + puesto.solicitudesPendientes, 0)
  const capacidadTotal = puestosActivos.reduce((total, puesto) => total + puesto.capacidadTrabajo, 0)

  const puestosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    return puestos.filter((puesto) => {
      const coincideTexto = !term
        || puesto.nombre.toLowerCase().includes(term)
        || puesto.direccion.toLowerCase().includes(term)
        || puesto.tipo.toLowerCase().includes(term)
        || puesto.admin.email.toLowerCase().includes(term)

      const coincideFiltro =
        filtro === 'todos'
        || (filtro === 'activos' && puesto.activo)
        || (filtro === 'inactivos' && !puesto.activo)
        || (filtro === 'con-peticiones' && puesto.solicitudesPendientes > 0)

      return coincideTexto && coincideFiltro
    })
  }, [busqueda, filtro, puestos])

  const openEdit = (puesto: PuestoCoordinador) => {
    setActionError('')
    setEditando(puesto)
    setForm(puestoToForm(puesto))
  }

  const submitEdit = () => {
    if (!editando || !form) return

    guardarPuesto.mutate({
      id: editando.id,
      data: {
        nombre: form.nombre,
        direccion: form.direccion,
        tipo: form.tipo,
        descripcion: form.descripcion,
        latitud: Number(form.latitud),
        longitud: Number(form.longitud),
        capacidadTrabajo: Number(form.capacidadTrabajo),
        activo: form.activo,
      },
    })
  }

  return (
    <div className="min-h-full bg-gray-50 pb-8">
      <section className="border-b border-gray-200 bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-purple-700">Coordinacion</p>
            <h1 className="text-xl font-semibold text-gray-950">Gestion de puestos</h1>
            <p className="mt-1 text-sm text-gray-500">Puestos, solicitudes y capacidad operativa en una sola vista.</p>
          </div>
          <Badge variant="info">{puestosActivos.length} activos</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Solicitudes', value: pendientes.length },
            { label: 'Personas', value: personasEnPuestos },
            { label: 'Capacidad', value: capacidadTotal },
            { label: 'Peticiones', value: solicitudesParticipacionPendientes },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-lg font-semibold text-gray-950">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 rounded-lg border border-gray-200 bg-gray-100 p-1">
          {[
            { id: 'puestos', label: 'Puestos' },
            { id: 'solicitudes', label: 'Solicitudes' },
            { id: 'mapa', label: 'Mapa' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setVista(tab.id as Vista)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                vista === tab.id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {actionError && (
        <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {vista === 'puestos' && (
        <section className="px-4 pt-4">
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, direccion, tipo o admin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'activos', label: 'Activos' },
                { id: 'inactivos', label: 'Inactivos' },
                { id: 'con-peticiones', label: 'Con peticiones' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id as FiltroPuestos)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    filtro === item.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {isLoadingPuestos ? (
              <LoadingState />
            ) : isErrorPuestos ? (
              <EmptyState title="No se pudieron cargar los puestos" text="Revisa que el backend este actualizado." />
            ) : puestosFiltrados.length === 0 ? (
              <EmptyState title="Sin puestos para este filtro" text="Ajusta la busqueda o revisa solicitudes pendientes." />
            ) : (
              <div className="space-y-3">
                {puestosFiltrados.map((puesto) => (
                  <article key={puesto.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-gray-950">{puesto.nombre}</h2>
                          {estadoPuestoBadge(puesto)}
                          {estadoOperativoBadge(puesto.estadoOperativo)}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{puesto.direccion}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDetailError('')
                            setDetalleId(puesto.id)
                          }}
                        >
                          Ver
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(puesto)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setEliminando(puesto)} disabled={!puesto.activo}>
                          Eliminar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <Metric label="Tipo" value={puesto.tipo} />
                      <Metric label="Personas" value={String(puesto.personasTotales)} />
                      <Metric label="Voluntarios" value={`${puesto.voluntariosActivos}/${puesto.capacidadTrabajo}`} />
                      <Metric label="Necesidades" value={String(puesto.necesidades)} />
                    </div>

                    <div className="mt-3 grid gap-1 text-xs text-gray-500">
                      <p>Admin: {puesto.admin.nombre} {puesto.admin.apellidos} - {puesto.admin.email}</p>
                      <p>Ubicacion: {puesto.latitud.toFixed(4)}, {puesto.longitud.toFixed(4)}</p>
                      {puesto.solicitudesPendientes > 0 && (
                        <p className="font-medium text-amber-700">
                          {puesto.solicitudesPendientes} solicitudes de participacion pendientes
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {vista === 'solicitudes' && (
        <section className="px-4 pt-4">
          {isLoadingSolicitudes ? (
            <LoadingState />
          ) : solicitudes.length === 0 ? (
            <EmptyState title="Sin solicitudes" text="Cuando un usuario pida crear un puesto aparecera aqui." />
          ) : (
            <div className="space-y-3">
              {solicitudes.map((solicitud) => (
                <article key={solicitud.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-950">{solicitud.nombre}</h2>
                      <p className="mt-1 text-sm text-gray-500">{solicitud.direccion}</p>
                    </div>
                    {estadoSolicitudBadge(solicitud.estado)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <Metric label="Tipo" value={solicitud.tipo} />
                    <Metric label="Ubicacion" value={`${solicitud.latitud.toFixed(4)}, ${solicitud.longitud.toFixed(4)}`} />
                  </div>

                  <div className="mt-3 text-xs text-gray-500">
                    <p>Solicitante: {solicitud.usuario.nombre} {solicitud.usuario.apellidos} - {solicitud.usuario.email}</p>
                    {solicitud.usuario.telefono && <p>Telefono: {solicitud.usuario.telefono}</p>}
                    {solicitud.descripcion && <p>Notas: {solicitud.descripcion}</p>}
                    {solicitud.motivoRechazo && <p className="text-red-700">Motivo rechazo: {solicitud.motivoRechazo}</p>}
                  </div>

                  {solicitud.estado === 'PENDIENTE' && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        loading={aceptar.isPending && aceptar.variables === solicitud.id}
                        onClick={() => aceptar.mutate(solicitud.id)}
                      >
                        Aceptar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={rechazar.isPending && rechazar.variables?.id === solicitud.id}
                        onClick={() => {
                          setActionError('')
                          setRechazoId(solicitud.id)
                          setMotivoRechazo('')
                        }}
                      >
                        Rechazar
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {vista === 'mapa' && (
        <section className="px-4 pt-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-950">Vista territorial</h2>
              <span className="text-xs text-gray-500">{puestosActivos.length} puestos activos</span>
            </div>
            <Map className="h-[420px] w-full" />
          </div>
        </section>
      )}

      {rechazoId && (
        <Modal>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              rechazar.mutate({ id: rechazoId, motivo: motivoRechazo.trim() || undefined })
            }}
            className="space-y-3"
          >
            <ModalTitle title="Rechazar solicitud" text="Indica el motivo para que el puesto pueda corregirla." />
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder="Faltan datos de ubicacion, no procede en esta zona..."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <ModalActions onCancel={() => setRechazoId(null)}>
              <Button type="submit" variant="danger" loading={rechazar.isPending}>Rechazar</Button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {editando && form && (
        <Modal wide>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitEdit()
            }}
            className="space-y-4"
          >
            <ModalTitle title="Editar puesto" text="Actualiza los datos operativos visibles para coordinacion y equipos." />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" value={form.nombre} onChange={(value) => setForm({ ...form, nombre: value })} />
              <Field label="Tipo" value={form.tipo} onChange={(value) => setForm({ ...form, tipo: value })} />
              <Field label="Direccion" value={form.direccion} onChange={(value) => setForm({ ...form, direccion: value })} />
              <Field label="Capacidad" type="number" value={form.capacidadTrabajo} onChange={(value) => setForm({ ...form, capacidadTrabajo: value })} />
              <Field label="Latitud" type="number" value={form.latitud} onChange={(value) => setForm({ ...form, latitud: value })} />
              <Field label="Longitud" type="number" value={form.longitud} onChange={(value) => setForm({ ...form, longitud: value })} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600">Descripcion</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
            </div>

            <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <span>
                <span className="block text-sm font-medium text-gray-900">Puesto activo</span>
                <span className="block text-xs text-gray-500">Si lo desactivas, no aparecera como operativo.</span>
              </span>
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
            </label>

            <ModalActions onCancel={() => setEditando(null)}>
              <Button type="submit" loading={guardarPuesto.isPending}>Guardar cambios</Button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {eliminando && (
        <Modal>
          <div className="space-y-4">
            <ModalTitle
              title="Eliminar puesto"
              text={`Se desactivara ${eliminando.nombre}, se cancelaran asignaciones activas y se rechazaran peticiones pendientes.`}
            />
            <ModalActions onCancel={() => setEliminando(null)}>
              <Button
                variant="danger"
                loading={eliminarPuesto.isPending}
                onClick={() => eliminarPuesto.mutate(eliminando.id)}
              >
                Eliminar puesto
              </Button>
            </ModalActions>
          </div>
        </Modal>
      )}

      {detalleId && (
        <Modal wide>
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <ModalTitle
              title={detalle?.puesto.nombre ?? 'Detalle del puesto'}
              text={detalle?.puesto.direccion ?? 'Cargando informacion operativa...'}
            />

            {isLoadingDetalle || !detalle ? (
              <div className="py-8">
                <LoadingState />
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {estadoPuestoBadge(detalle.puesto)}
                  {estadoOperativoBadge(detalle.puesto.estadoOperativo)}
                  <Badge variant="default">{detalle.puesto.personasTotales} personas</Badge>
                  <Badge variant="default">{detalle.puesto.necesidades} necesidades</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Capacidad" value={String(detalle.puesto.capacidadTrabajo)} />
                  <Metric label="Voluntarios" value={String(detalle.puesto.voluntariosActivos)} />
                  <Metric label="Responsables" value={String(detalle.puesto.responsables)} />
                  <Metric label="Peticiones" value={String(detalle.puesto.solicitudesPendientes)} />
                </div>

                <DetailSection title="Solicitudes de participacion">
                  {detailError && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {detailError}
                    </div>
                  )}
                  {detalle.solicitudesParticipacion.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay solicitudes para este puesto.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.solicitudesParticipacion.map((solicitud) => (
                        <div key={solicitud.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-950">
                                {solicitud.usuario.nombre} {solicitud.usuario.apellidos}
                              </p>
                              <p className="text-xs text-gray-500">{solicitud.usuario.email}</p>
                            </div>
                            {estadoSolicitudBadge(solicitud.estado)}
                          </div>
                          {solicitud.estado === 'PENDIENTE' && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                loading={aceptarParticipacion.isPending && aceptarParticipacion.variables === solicitud.id}
                                onClick={() => aceptarParticipacion.mutate(solicitud.id)}
                              >
                                Aceptar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={rechazarParticipacion.isPending && rechazarParticipacion.variables === solicitud.id}
                                onClick={() => rechazarParticipacion.mutate(solicitud.id)}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Voluntarios activos">
                  {detalle.participantes.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay voluntarios activos ahora mismo.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.participantes.map((participante) => (
                        <p key={participante.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          {participante.usuario.nombre} {participante.usuario.apellidos} - {participante.usuario.email}
                        </p>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Inventario">
                  {detalle.inventario.length === 0 ? (
                    <p className="text-sm text-gray-500">Sin inventario registrado.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {detalle.inventario.map((item) => (
                        <div key={item.id} className="rounded-lg bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-950">{item.producto.nombre}</p>
                            <Badge variant={item.tipo === 'NECESARIO' ? 'warning' : 'success'}>{item.tipo}</Badge>
                          </div>
                          <p className="text-xs text-gray-500">{item.cantidad} {item.producto.unidad}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Donaciones en curso">
                  {detalle.donaciones.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay donaciones en camino o pendientes.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.donaciones.map((donacion) => (
                        <p key={donacion.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          {donacion.producto.nombre}: {donacion.cantidad} {donacion.unidad} - {donacion.estado}
                        </p>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Actividad reciente">
                  {detalle.actividad.length === 0 ? (
                    <p className="text-sm text-gray-500">Todavia no hay actividad registrada para este puesto.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.actividad.map((evento) => (
                        <div key={evento.id} className="rounded-lg bg-gray-50 px-3 py-2">
                          <p className="text-sm font-medium text-gray-950">{formatAccion(evento.accion)}</p>
                          <p className="text-xs text-gray-500">
                            {evento.usuario
                              ? `${evento.usuario.nombre} ${evento.usuario.apellidos} - ${evento.usuario.email}`
                              : 'Sistema'} · {new Date(evento.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>

                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDetailError('')
                      setDetalleId(null)
                    }}
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="truncate text-sm font-medium text-gray-950">{value}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex justify-center rounded-lg border border-gray-200 bg-white py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-purple-600" />
    </div>
  )
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
      <p className="font-medium text-gray-950">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{text}</p>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 p-3">
      <h3 className="mb-3 text-sm font-semibold text-gray-950">{title}</h3>
      {children}
    </section>
  )
}

function Modal({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center">
      <div className={`w-full rounded-lg border border-gray-200 bg-white p-4 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
        {children}
      </div>
    </div>
  )
}

function ModalTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="font-semibold text-gray-950">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{text}</p>
    </div>
  )
}

function ModalActions({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
      />
    </label>
  )
}

function formatAccion(accion: string) {
  const labels: Record<string, string> = {
    EDITAR_PUESTO: 'Puesto editado',
    DESACTIVAR_PUESTO: 'Puesto desactivado',
    ELIMINAR_PUESTO: 'Puesto eliminado',
    ACEPTAR_PARTICIPACION_PUESTO: 'Participacion aceptada',
    RECHAZAR_PARTICIPACION_PUESTO: 'Participacion rechazada',
  }

  return labels[accion] ?? accion
}
