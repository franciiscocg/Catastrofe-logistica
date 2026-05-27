import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'

type SolicitudEstado = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
type PuestoEstado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
type Vista = 'incidencias' | 'usuarios' | 'puestos'
type FiltroIncidencias = 'todas' | 'cortadas' | 'transitables' | 'sin-voluntarios'
type FiltroUsuarios = 'todos' | 'CIUDADANO' | 'VOLUNTARIO' | 'PUESTO_EMERGENCIA' | 'COORDINADOR'
type FiltroPuestos = 'aprobados' | 'pendientes' | 'rechazados'

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
  necesitaVoluntarios: boolean
  necesitaRecursos: boolean
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
    decidedAt?: string | null
    responsable?: { nombre: string; apellidos: string } | null
  }>
  responsables: Array<{
    id: string
    usuario: { nombre: string; apellidos: string; email: string; telefono?: string | null }
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
  estadoSolicitud: PuestoEstado
}

function estadoSolicitudBadge(estado: SolicitudEstado) {
  if (estado === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  if (estado === 'ACEPTADA') return <Badge variant="success">Aceptada</Badge>
  return <Badge variant="danger">Rechazada</Badge>
}

interface Incidencia {
  id: string
  titulo?: string | null
  categoria?: string | null
  estado: 'CORTADA' | 'TRANSITABLE'
  descripcion?: string | null
  latitud: number
  longitud: number
  createdAt: string
  updatedAt?: string
  _count: { comentarios: number; asignacionesVoluntarios: number }
}

interface IncidenciaForm {
  titulo: string
  categoria: string
  descripcion: string
  estado: Incidencia['estado']
}

interface VoluntarioIncidencia {
  id: string
  startedAt: string
  voluntario: {
    usuario: { nombre: string; apellidos: string; email: string; telefono?: string | null }
  }
}

interface UsuarioGestion {
  id: string
  email: string
  nombre: string
  apellidos: string
  roles: string[]
  activo: boolean
  emailVerified: boolean
  createdAt: string
}

interface UsuarioForm {
  id: string
  roles: string[]
}

const rolesDisponibles = ['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA', 'COORDINADOR'] as const

function fechaSolicitud(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function estadoPuestoBadge(puesto: PuestoCoordinador) {
  if (puesto.estadoSolicitud === 'APROBADO') return <Badge variant="success">Aprobado</Badge>
  if (puesto.estadoSolicitud === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  return <Badge variant="danger">Rechazado</Badge>
}

function estadoCapacidadBadge(puesto: PuestoCoordinador) {
  if (puesto.estadoSolicitud !== 'APROBADO') return null
  if (puesto.necesitaVoluntarios) return <Badge variant="info">Necesita voluntarios</Badge>
  return <Badge variant="success">Plantilla completa</Badge>
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
    estadoSolicitud: puesto.estadoSolicitud,
  }
}

function parseApiError(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
    ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? fallback
}

export default function CoordinadorDashboard() {
  const queryClient = useQueryClient()
  const [vista, setVista] = useState<Vista>('usuarios')
  const [busquedaIncidencias, setBusquedaIncidencias] = useState('')
  const [filtroIncidencias, setFiltroIncidencias] = useState<FiltroIncidencias>('todas')
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('')
  const [filtroUsuarios, setFiltroUsuarios] = useState<FiltroUsuarios>('todos')
  const [busquedaPuestos, setBusquedaPuestos] = useState('')
  const [filtroPuestos, setFiltroPuestos] = useState<FiltroPuestos>('aprobados')
  const [rechazoParticipacionId, setRechazoParticipacionId] = useState<string | null>(null)
  const [motivoRechazoParticipacion, setMotivoRechazoParticipacion] = useState('')
  const [editando, setEditando] = useState<PuestoCoordinador | null>(null)
  const [eliminando, setEliminando] = useState<PuestoCoordinador | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [form, setForm] = useState<PuestoForm | null>(null)
  const [actionError, setActionError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [responsableEmail, setResponsableEmail] = useState('')
  const [voluntarioEmail, setVoluntarioEmail] = useState('')
  const [voluntariosIncidenciaId, setVoluntariosIncidenciaId] = useState<string | null>(null)
  const [incidenciaEditando, setIncidenciaEditando] = useState<Incidencia | null>(null)
  const [incidenciaForm, setIncidenciaForm] = useState<IncidenciaForm | null>(null)
  const [incidenciaAEliminar, setIncidenciaAEliminar] = useState<Incidencia | null>(null)
  const [voluntarioARetirar, setVoluntarioARetirar] = useState<{
    incidenciaId: string
    asignacionId: string
    nombre: string
  } | null>(null)
  const [usuarioForm, setUsuarioForm] = useState<UsuarioForm | null>(null)

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

  const { data: incidencias = [], isLoading: isLoadingIncidencias } = useQuery({
    queryKey: ['incidencias-coordinador'],
    queryFn: () =>
      apiClient.get<{ incidencias: Incidencia[] }>('/api/incidencias').then((r) => r.data.incidencias),
  })

  const { data: usuarios = [], isLoading: isLoadingUsuarios } = useQuery({
    queryKey: ['usuarios-coordinador'],
    queryFn: () =>
      apiClient.get<{ usuarios: UsuarioGestion[] }>('/api/users/coordinador').then((r) => r.data.usuarios),
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
    queryClient.invalidateQueries({ queryKey: ['puestos-coordinador'] })
  }

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
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo retirar el puesto')),
  })

  const { data: voluntariosIncidencia = [], isLoading: isLoadingVoluntariosIncidencia } = useQuery({
    queryKey: ['voluntarios-incidencia-coordinador', voluntariosIncidenciaId],
    enabled: Boolean(voluntariosIncidenciaId),
    queryFn: () =>
      apiClient
        .get<{ voluntarios: VoluntarioIncidencia[] }>(`/api/incidencias/coordinador/${voluntariosIncidenciaId}/voluntarios`)
        .then((r) => r.data.voluntarios),
  })

  const eliminarIncidencia = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/incidencias/${id}`),
    onSuccess: () => {
      setIncidenciaAEliminar(null)
      queryClient.invalidateQueries({ queryKey: ['incidencias-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo eliminar la incidencia')),
  })

  const guardarIncidencia = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IncidenciaForm }) =>
      apiClient.patch(`/api/incidencias/coordinador/${id}`, {
        titulo: data.titulo.trim() || null,
        categoria: data.categoria || null,
        descripcion: data.descripcion.trim() || null,
        estado: data.estado,
      }),
    onSuccess: () => {
      setActionError('')
      setIncidenciaEditando(null)
      setIncidenciaForm(null)
      queryClient.invalidateQueries({ queryKey: ['incidencias-coordinador'] })
      queryClient.invalidateQueries({ queryKey: ['voluntarios-incidencia-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo editar la incidencia')),
  })

  const retirarVoluntarioIncidencia = useMutation({
    mutationFn: ({ incidenciaId, asignacionId }: { incidenciaId: string; asignacionId: string }) =>
      apiClient.delete(`/api/incidencias/coordinador/${incidenciaId}/voluntarios/${asignacionId}`),
    onSuccess: () => {
      setVoluntarioARetirar(null)
      queryClient.invalidateQueries({ queryKey: ['incidencias-coordinador'] })
      queryClient.invalidateQueries({ queryKey: ['voluntarios-incidencia-coordinador', voluntariosIncidenciaId] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo retirar el voluntario')),
  })

  const gestionarUsuario = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { roles: string[] } }) =>
      apiClient.patch(`/api/users/coordinador/${id}`, data),
    onSuccess: () => {
      setUsuarioForm(null)
      queryClient.invalidateQueries({ queryKey: ['usuarios-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo actualizar el usuario')),
  })

  const asignarResponsable = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      apiClient.post(`/api/puestos/coordinador/${id}/responsables`, { email }),
    onSuccess: () => {
      setResponsableEmail('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo asignar el responsable')),
  })

  const asignarVoluntario = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      apiClient.post(`/api/puestos/coordinador/${id}/voluntarios`, { email }),
    onSuccess: () => {
      setVoluntarioEmail('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo asignar el voluntario')),
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
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiClient.post(`/api/puestos/coordinador/participaciones/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      setActionError('')
      setDetailError('')
      setRechazoParticipacionId(null)
      setMotivoRechazoParticipacion('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo rechazar la participacion')),
  })

  const incidenciasFiltradas = useMemo(() => {
    const term = busquedaIncidencias.trim().toLowerCase()
    return incidencias.filter((incidencia) => {
      const coincideTexto = !term
        || (incidencia.titulo ?? '').toLowerCase().includes(term)
        || (incidencia.categoria ?? '').toLowerCase().includes(term)
        || (incidencia.descripcion ?? '').toLowerCase().includes(term)
      const coincideFiltro = filtroIncidencias === 'todas'
        || (filtroIncidencias === 'cortadas' && incidencia.estado === 'CORTADA')
        || (filtroIncidencias === 'transitables' && incidencia.estado === 'TRANSITABLE')
        || (filtroIncidencias === 'sin-voluntarios'
          && incidencia.estado === 'CORTADA'
          && incidencia._count.asignacionesVoluntarios === 0)
      return coincideTexto && coincideFiltro
    })
  }, [busquedaIncidencias, filtroIncidencias, incidencias])

  const usuariosFiltrados = useMemo(() => {
    const term = busquedaUsuarios.trim().toLowerCase()
    return usuarios.filter((usuario) => {
      const coincideTexto = !term
        || `${usuario.nombre} ${usuario.apellidos}`.toLowerCase().includes(term)
        || usuario.email.toLowerCase().includes(term)
      const coincideFiltro = filtroUsuarios === 'todos'
        || usuario.roles.includes(filtroUsuarios)
      return coincideTexto && coincideFiltro
    })
  }, [busquedaUsuarios, filtroUsuarios, usuarios])

  const puestosFiltrados = useMemo(() => {
    const term = busquedaPuestos.trim().toLowerCase()
    return puestos.filter((puesto) => {
      const coincideTexto = !term
        || puesto.nombre.toLowerCase().includes(term)
        || puesto.direccion.toLowerCase().includes(term)
        || puesto.tipo.toLowerCase().includes(term)
        || puesto.admin.email.toLowerCase().includes(term)

      const coincideFiltro = (filtroPuestos === 'aprobados' && puesto.activo && puesto.estadoSolicitud === 'APROBADO')
        || (filtroPuestos === 'pendientes' && puesto.activo && puesto.estadoSolicitud === 'PENDIENTE')
        || (filtroPuestos === 'rechazados' && puesto.estadoSolicitud === 'RECHAZADO')

      return coincideTexto && coincideFiltro
    })
  }, [busquedaPuestos, filtroPuestos, puestos])

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
        estadoSolicitud: form.estadoSolicitud,
      },
    })
  }

  const openEditIncidencia = (incidencia: Incidencia) => {
    setActionError('')
    setIncidenciaEditando(incidencia)
    setIncidenciaForm({
      titulo: incidencia.titulo ?? '',
      categoria: incidencia.categoria ?? '',
      descripcion: incidencia.descripcion ?? '',
      estado: incidencia.estado,
    })
  }

  return (
    <div className="min-h-full bg-gray-50 pb-8">
      <section className="border-b border-gray-200 bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-purple-700">Coordinacion</p>
            <h1 className="text-xl font-semibold text-gray-950">Gestion general</h1>
            <p className="mt-1 text-sm text-gray-500">Consulta y edita la informacion operativa de la aplicacion.</p>
          </div>
          <Badge variant="info">Coordinador</Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Incidencias', value: incidencias.length },
            { label: 'Usuarios', value: usuarios.length },
            { label: 'Puestos', value: puestos.filter((puesto) => puesto.activo).length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-lg font-semibold text-gray-950">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
          {[
            { id: 'incidencias', label: 'Incidencias' },
            { id: 'usuarios', label: 'Usuarios' },
            { id: 'puestos', label: 'Puestos' },
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

      <datalist id="coordinador-usuarios">
        {usuarios.filter((usuario) => usuario.activo).map((usuario) => (
          <option key={usuario.id} value={usuario.email}>{usuario.nombre} {usuario.apellidos}</option>
        ))}
      </datalist>

      {vista === 'puestos' && (
        <section className="px-4 pt-4">
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <div>
              <h2 className="font-semibold text-gray-950">Puestos de emergencia</h2>
              <p className="text-xs text-gray-500">Gestiona los puestos aprobados, tramita solicitudes y consulta el historial.</p>
            </div>
            <input
              value={busquedaPuestos}
              onChange={(e) => setBusquedaPuestos(e.target.value)}
              placeholder="Buscar por nombre, direccion, tipo o admin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
            <FilterBar
              value={filtroPuestos}
              onChange={(value) => setFiltroPuestos(value as FiltroPuestos)}
              options={[
                { value: 'aprobados', label: 'Aprobados' },
                { value: 'pendientes', label: 'Solicitudes pendientes' },
                { value: 'rechazados', label: 'Historial de rechazados' },
              ]}
            />
          </div>

          <div className="mt-4">
            {isLoadingPuestos ? (
              <LoadingState />
            ) : isErrorPuestos ? (
              <EmptyState title="No se pudieron cargar los puestos" text="Revisa que el backend este actualizado." />
            ) : puestosFiltrados.length === 0 ? (
              <EmptyState title="Sin puestos" text="No hay puestos que coincidan con la busqueda." />
            ) : (
              <div className="space-y-3">
                {puestosFiltrados.map((puesto) => (
                  <article key={puesto.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-gray-950">{puesto.nombre}</h2>
                          {estadoPuestoBadge(puesto)}
                          {estadoCapacidadBadge(puesto)}
                          {puesto.necesitaRecursos && <Badge variant="danger">Necesita recursos</Badge>}
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

      {vista === 'incidencias' && (
        <section className="px-4 pt-4">
          <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="font-semibold text-gray-950">Incidencias registradas</h2>
            <p className="text-xs text-gray-500">Consulta, edita y revisa los voluntarios que se han unido a cada incidencia.</p>
            <input
              value={busquedaIncidencias}
              onChange={(e) => setBusquedaIncidencias(e.target.value)}
              placeholder="Buscar por titulo, categoria o descripcion"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
            <FilterBar
              value={filtroIncidencias}
              onChange={(value) => setFiltroIncidencias(value as FiltroIncidencias)}
              options={[
                { value: 'todas', label: 'Todas' },
                { value: 'cortadas', label: 'Cortadas' },
                { value: 'transitables', label: 'Transitables' },
                { value: 'sin-voluntarios', label: 'Sin voluntarios' },
              ]}
            />
          </div>
          {isLoadingIncidencias ? (
            <LoadingState />
          ) : incidenciasFiltradas.length === 0 ? (
            <EmptyState title="Sin incidencias" text="No hay incidencias que coincidan con la consulta." />
          ) : (
            <div className="space-y-3">
              {incidenciasFiltradas.map((incidencia) => (
                <article key={incidencia.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-gray-950">{incidencia.titulo || 'Incidencia en via'}</h2>
                        <Badge variant={incidencia.estado === 'CORTADA' ? 'danger' : 'success'}>{incidencia.estado}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{incidencia.descripcion || incidencia.categoria || 'Sin descripcion'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {incidencia.latitud.toFixed(4)}, {incidencia.longitud.toFixed(4)} - {incidencia._count.asignacionesVoluntarios} voluntarios activos
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Actualizada: {fechaSolicitud(incidencia.updatedAt ?? incidencia.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditIncidencia(incidencia)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setVoluntariosIncidenciaId(
                          voluntariosIncidenciaId === incidencia.id ? null : incidencia.id,
                        )}
                      >
                        {voluntariosIncidenciaId === incidencia.id ? 'Ocultar voluntarios' : 'Ver voluntarios'}
                      </Button>
                    </div>
                  </div>
                  {voluntariosIncidenciaId === incidencia.id && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-medium text-gray-600">Voluntarios en esta incidencia</p>
                      {isLoadingVoluntariosIncidencia ? (
                        <p className="text-sm text-gray-500">Cargando voluntarios...</p>
                      ) : voluntariosIncidencia.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay voluntarios ayudando en esta incidencia.</p>
                      ) : (
                        <div className="space-y-2">
                          {voluntariosIncidencia.map((asignacion) => (
                            <div key={asignacion.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-gray-950">
                                  {asignacion.voluntario.usuario.nombre} {asignacion.voluntario.usuario.apellidos}
                                </p>
                                <p className="text-xs text-gray-500">{asignacion.voluntario.usuario.email}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50"
                                loading={retirarVoluntarioIncidencia.isPending
                                  && retirarVoluntarioIncidencia.variables?.asignacionId === asignacion.id}
                                onClick={() => setVoluntarioARetirar({
                                  incidenciaId: incidencia.id,
                                  asignacionId: asignacion.id,
                                  nombre: `${asignacion.voluntario.usuario.nombre} ${asignacion.voluntario.usuario.apellidos}`,
                                })}
                              >
                                Retirar
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {vista === 'usuarios' && (
        <section className="px-4 pt-4">
          <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="font-semibold text-gray-950">Usuarios y roles</h2>
            <p className="text-xs text-gray-500">Consulta las cuentas y guarda los cambios de permisos de forma controlada.</p>
            <input
              value={busquedaUsuarios}
              onChange={(e) => setBusquedaUsuarios(e.target.value)}
              placeholder="Buscar por nombre o email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
            <FilterBar
              value={filtroUsuarios}
              onChange={(value) => setFiltroUsuarios(value as FiltroUsuarios)}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'CIUDADANO', label: 'Ciudadano' },
                { value: 'VOLUNTARIO', label: 'Voluntario' },
                { value: 'PUESTO_EMERGENCIA', label: 'Puesto' },
                { value: 'COORDINADOR', label: 'Coordinador' },
              ]}
            />
          </div>
          {isLoadingUsuarios ? (
            <LoadingState />
          ) : usuariosFiltrados.length === 0 ? (
            <EmptyState title="Sin usuarios" text="No hay cuentas que coincidan con la consulta." />
          ) : (
            <div className="space-y-3">
              {usuariosFiltrados.map((usuario) => (
                <article key={usuario.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold text-gray-950">{usuario.nombre} {usuario.apellidos}</h2>
                      <p className="text-sm text-gray-500">{usuario.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setUsuarioForm(
                          usuarioForm?.id === usuario.id
                            ? null
                            : { id: usuario.id, roles: [...usuario.roles] },
                        )}
                      >
                        {usuarioForm?.id === usuario.id ? 'Cancelar' : 'Editar roles'}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Roles: {usuario.roles.map((rol) => rol.replace('_', ' ')).join(', ')}
                  </p>
                  {usuarioForm?.id === usuario.id && (
                    <div className="mt-4 rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-medium text-gray-600">Permisos de acceso</p>
                      <div className="flex flex-wrap gap-2">
                        {rolesDisponibles.map((rol) => {
                          const seleccionado = usuarioForm.roles.includes(rol)
                          return (
                            <button
                              key={rol}
                              type="button"
                              onClick={() => {
                                const roles = seleccionado ? usuarioForm.roles.filter((actual) => actual !== rol) : [...usuarioForm.roles, rol]
                                if (roles.length > 0) setUsuarioForm({ ...usuarioForm, roles })
                              }}
                              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                seleccionado
                                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                              aria-pressed={seleccionado}
                            >
                              {rol.replace('_', ' ')}
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          loading={gestionarUsuario.isPending}
                          onClick={() => gestionarUsuario.mutate({
                            id: usuario.id,
                            data: { roles: usuarioForm.roles },
                          })}
                        >
                          Guardar cambios
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setUsuarioForm(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {incidenciaAEliminar && (
        <Modal>
          <div className="space-y-4">
            <ModalTitle
              title="Eliminar incidencia"
              text={`Esta accion retirara "${incidenciaAEliminar.titulo || 'Incidencia en via'}" y las asignaciones de voluntarios asociadas.`}
            />
            <ModalActions onCancel={() => setIncidenciaAEliminar(null)}>
              <Button
                variant="danger"
                loading={eliminarIncidencia.isPending}
                onClick={() => eliminarIncidencia.mutate(incidenciaAEliminar.id)}
              >
                Confirmar eliminacion
              </Button>
            </ModalActions>
          </div>
        </Modal>
      )}

      {voluntarioARetirar && (
        <Modal>
          <div className="space-y-4">
            <ModalTitle
              title="Retirar voluntario"
              text={`Se retirara a ${voluntarioARetirar.nombre} de esta incidencia. Podra volver a ofrecerse en otra tarea si procede.`}
            />
            <ModalActions onCancel={() => setVoluntarioARetirar(null)}>
              <Button
                variant="danger"
                loading={retirarVoluntarioIncidencia.isPending}
                onClick={() => retirarVoluntarioIncidencia.mutate(voluntarioARetirar)}
              >
                Confirmar retirada
              </Button>
            </ModalActions>
          </div>
        </Modal>
      )}

      {incidenciaEditando && incidenciaForm && (
        <Modal>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              guardarIncidencia.mutate({ id: incidenciaEditando.id, data: incidenciaForm })
            }}
          >
            <ModalTitle title="Editar incidencia" text="Actualiza la informacion que necesita el equipo para actuar." />
            <label className="block text-sm text-gray-700">
              <span className="mb-1 block font-medium">Titulo</span>
              <input
                value={incidenciaForm.titulo}
                onChange={(e) => setIncidenciaForm({ ...incidenciaForm, titulo: e.target.value })}
                maxLength={120}
                placeholder="Incidencia en via"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-gray-700">
                <span className="mb-1 block font-medium">Categoria</span>
                <select
                  value={incidenciaForm.categoria}
                  onChange={(e) => setIncidenciaForm({ ...incidenciaForm, categoria: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Sin categoria</option>
                  <option value="inundacion">Inundacion</option>
                  <option value="obstaculos_via">Obstaculos en via</option>
                  <option value="limpieza">Limpieza</option>
                  <option value="asistencia">Asistencia</option>
                </select>
              </label>
              <label className="block text-sm text-gray-700">
                <span className="mb-1 block font-medium">Estado</span>
                <select
                  value={incidenciaForm.estado}
                  onChange={(e) => setIncidenciaForm({ ...incidenciaForm, estado: e.target.value as Incidencia['estado'] })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="CORTADA">Cortada</option>
                  <option value="TRANSITABLE">Transitable</option>
                </select>
              </label>
            </div>
            <label className="block text-sm text-gray-700">
              <span className="mb-1 block font-medium">Descripcion</span>
              <textarea
                value={incidenciaForm.descripcion}
                onChange={(e) => setIncidenciaForm({ ...incidenciaForm, descripcion: e.target.value })}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <ModalActions onCancel={() => {
              setIncidenciaEditando(null)
              setIncidenciaForm(null)
            }}>
              <Button
                type="button"
                variant="ghost"
                className="text-red-700 hover:bg-red-50"
                onClick={() => {
                  setIncidenciaEditando(null)
                  setIncidenciaForm(null)
                  setIncidenciaAEliminar(incidenciaEditando)
                }}
              >
                Eliminar registro
              </Button>
              <Button type="submit" loading={guardarIncidencia.isPending}>Guardar cambios</Button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {rechazoParticipacionId && (
        <Modal>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              rechazarParticipacion.mutate({
                id: rechazoParticipacionId,
                motivo: motivoRechazoParticipacion.trim(),
              })
            }}
            className="space-y-3"
          >
            <ModalTitle title="Rechazar participacion" text="Indica por que esta persona no puede incorporarse al puesto." />
            <textarea
              value={motivoRechazoParticipacion}
              onChange={(e) => setMotivoRechazoParticipacion(e.target.value)}
              rows={3}
              required
              minLength={10}
              maxLength={500}
              placeholder="Aforo completo, perfil no adecuado para esta tarea..."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <ModalActions onCancel={() => setRechazoParticipacionId(null)}>
              <Button type="submit" variant="danger" loading={rechazarParticipacion.isPending}>Rechazar</Button>
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

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Estado de gestion</span>
              <select
                value={form.estadoSolicitud}
                onChange={(e) => setForm({ ...form, estadoSolicitud: e.target.value as PuestoEstado })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                <option value="APROBADO">Aprobado</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="RECHAZADO">Rechazado</option>
              </select>
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-600">Descripcion</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
            </div>

            <ModalActions onCancel={() => setEditando(null)}>
              <Button
                type="button"
                variant="ghost"
                className="text-red-700 hover:bg-red-50"
                onClick={() => {
                  setEditando(null)
                  setEliminando(editando)
                }}
              >
                Retirar puesto
              </Button>
              <Button type="submit" loading={guardarPuesto.isPending}>Guardar cambios</Button>
            </ModalActions>
          </form>
        </Modal>
      )}

      {eliminando && (
        <Modal>
          <div className="space-y-4">
            <ModalTitle
              title="Retirar puesto"
              text={`Se retirara ${eliminando.nombre} de la operativa, se cancelaran asignaciones activas y se conservara el historial.`}
            />
            <ModalActions onCancel={() => setEliminando(null)}>
              <Button
                variant="danger"
                loading={eliminarPuesto.isPending}
                onClick={() => eliminarPuesto.mutate(eliminando.id)}
              >
                Confirmar retirada
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
                  {estadoCapacidadBadge(detalle.puesto)}
                  {detalle.puesto.necesitaRecursos && <Badge variant="danger">Necesita recursos</Badge>}
                  <Badge variant="default">{detalle.puesto.personasTotales} personas</Badge>
                  <Badge variant="default">{detalle.puesto.necesidades} necesidades</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Capacidad" value={String(detalle.puesto.capacidadTrabajo)} />
                  <Metric label="Voluntarios" value={String(detalle.puesto.voluntariosActivos)} />
                  <Metric label="Responsables" value={String(detalle.puesto.responsables)} />
                  <Metric label="Peticiones" value={String(detalle.puesto.solicitudesPendientes)} />
                </div>

                <DetailSection title="Asignacion directa">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        asignarResponsable.mutate({ id: detalle.puesto.id, email: responsableEmail })
                      }}
                    >
                      <p className="text-xs font-medium text-gray-600">Nuevo responsable del puesto</p>
                      <input
                        type="email"
                        list="coordinador-usuarios"
                        required
                        value={responsableEmail}
                        onChange={(e) => setResponsableEmail(e.target.value)}
                        placeholder="responsable@email.com"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <Button type="submit" size="sm" loading={asignarResponsable.isPending}>Asignar responsable</Button>
                    </form>
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        asignarVoluntario.mutate({ id: detalle.puesto.id, email: voluntarioEmail })
                      }}
                    >
                      <p className="text-xs font-medium text-gray-600">Incorporar voluntario operativo</p>
                      <input
                        type="email"
                        list="coordinador-usuarios"
                        required
                        value={voluntarioEmail}
                        onChange={(e) => setVoluntarioEmail(e.target.value)}
                        placeholder="voluntario@email.com"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <Button type="submit" size="sm" loading={asignarVoluntario.isPending}>Asignar voluntario</Button>
                    </form>
                  </div>
                </DetailSection>

                <DetailSection title="Responsables adicionales">
                  {detalle.responsables.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay responsables adicionales asignados.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.responsables.map((responsable) => (
                        <p key={responsable.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          {responsable.usuario.nombre} {responsable.usuario.apellidos} - {responsable.usuario.email}
                        </p>
                      ))}
                    </div>
                  )}
                </DetailSection>

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
                          <p className="mt-2 text-xs text-gray-500">Solicitada: {fechaSolicitud(solicitud.createdAt)}</p>
                          {solicitud.decidedAt && (
                            <p className="mt-1 text-xs text-gray-500">
                              Resuelta: {fechaSolicitud(solicitud.decidedAt)}
                              {solicitud.responsable && ` por ${solicitud.responsable.nombre} ${solicitud.responsable.apellidos}`}
                            </p>
                          )}
                          {solicitud.motivoRechazo && (
                            <p className="mt-2 text-xs text-red-700">Motivo rechazo: {solicitud.motivoRechazo}</p>
                          )}
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
                                loading={rechazarParticipacion.isPending && rechazarParticipacion.variables?.id === solicitud.id}
                                onClick={() => {
                                  setRechazoParticipacionId(solicitud.id)
                                  setMotivoRechazoParticipacion('')
                                }}
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

function FilterBar({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
            value === option.value
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {option.label}
        </button>
      ))}
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
        step={type === 'number' ? 'any' : undefined}
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
