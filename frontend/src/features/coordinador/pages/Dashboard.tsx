import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'

type SolicitudEstado = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
type PuestoEstado = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
type Vista = 'resumen' | 'puestos' | 'incidencias' | 'usuarios'
type FiltroIncidencias = 'todas' | 'cortadas' | 'transitables' | 'sin-voluntarios'
type FiltroUsuarios = 'todos' | 'CIUDADANO' | 'VOLUNTARIO' | 'PUESTO_EMERGENCIA' | 'COORDINADOR'
type FiltroPuestos = 'aprobados' | 'pendientes' | 'rechazados'

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
  decidedAt?: string | null
  usuario: {
    nombre: string
    apellidos: string
    email: string
    telefono?: string | null
    dni?: string | null
  }
  coordinador?: {
    nombre: string
    apellidos: string
  } | null
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

function formatTipoPuesto(tipo: string) {
  const labels: Record<string, string> = {
    centro_civico: 'Centro cívico',
    centro_cívico: 'Centro cívico',
    pabellon: 'Pabellón',
    pabellón: 'Pabellón',
    almacen: 'Almacén',
    almacén: 'Almacén',
    colegio: 'Colegio',
    hospital: 'Hospital',
  }
  const normalizado = tipo.trim().toLowerCase()
  return labels[normalizado]
    ?? normalizado
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
}

export default function CoordinadorDashboard() {
  const queryClient = useQueryClient()
  const [vista, setVista] = useState<Vista>('resumen')
  const [busquedaIncidencias, setBusquedaIncidencias] = useState('')
  const [filtroIncidencias, setFiltroIncidencias] = useState<FiltroIncidencias>('todas')
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('')
  const [filtroUsuarios, setFiltroUsuarios] = useState<FiltroUsuarios>('todos')
  const [busquedaPuestos, setBusquedaPuestos] = useState('')
  const [filtroPuestos, setFiltroPuestos] = useState<FiltroPuestos>('aprobados')
  const [rechazoParticipacionId, setRechazoParticipacionId] = useState<string | null>(null)
  const [motivoRechazoParticipacion, setMotivoRechazoParticipacion] = useState('')
  const [rechazoSolicitudId, setRechazoSolicitudId] = useState<string | null>(null)
  const [motivoRechazoSolicitud, setMotivoRechazoSolicitud] = useState('')
  const [editando, setEditando] = useState<PuestoCoordinador | null>(null)
  const [eliminando, setEliminando] = useState<PuestoCoordinador | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [form, setForm] = useState<PuestoForm | null>(null)
  const [actionError, setActionError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [responsableEmail, setResponsableEmail] = useState('')
  const [voluntarioEmail, setVoluntarioEmail] = useState('')
  const [voluntariosIncidenciaId, setVoluntariosIncidenciaId] = useState<string | null>(null)
  const [usuarioForm, setUsuarioForm] = useState<UsuarioForm | null>(null)
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UsuarioGestion | null>(null)
  const [incidenciaAEliminar, setIncidenciaAEliminar] = useState<Incidencia | null>(null)

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
    data: solicitudesPuesto = [],
    isLoading: isLoadingSolicitudesPuesto,
  } = useQuery({
    queryKey: ['solicitudes-puesto-coordinador'],
    queryFn: () =>
      apiClient
        .get<{ solicitudes: SolicitudPuesto[] }>('/api/puestos/solicitudes')
        .then((r) => r.data.solicitudes),
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

  const gestionarUsuario = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { roles: string[] } }) =>
      apiClient.patch(`/api/users/coordinador/${id}`, data),
    onSuccess: () => {
      setUsuarioForm(null)
      queryClient.invalidateQueries({ queryKey: ['usuarios-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo actualizar el usuario')),
  })

  const eliminarUsuario = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/users/coordinador/${id}`),
    onSuccess: () => {
      setActionError('')
      setUsuarioAEliminar(null)
      setUsuarioForm(null)
      queryClient.invalidateQueries({ queryKey: ['usuarios-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo eliminar el usuario')),
  })

  const eliminarIncidencia = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/incidencias/${id}`),
    onSuccess: () => {
      setActionError('')
      setIncidenciaAEliminar(null)
      setVoluntariosIncidenciaId(null)
      queryClient.invalidateQueries({ queryKey: ['incidencias-coordinador'] })
      queryClient.invalidateQueries({ queryKey: ['voluntarios-incidencia-coordinador'] })
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo eliminar la incidencia')),
  })

  const cambiarResponsable = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      apiClient.patch(`/api/puestos/coordinador/${id}/responsable`, { email }),
    onSuccess: () => {
      setResponsableEmail('')
      invalidateGestion()
      queryClient.invalidateQueries({ queryKey: ['puesto-detalle-coordinador', detalleId] })
    },
    onError: (err: unknown) => setDetailError(parseApiError(err, 'No se pudo cambiar el responsable')),
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

  const aceptarSolicitudPuesto = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/puestos/solicitudes/${id}/aceptar`, {}),
    onSuccess: () => {
      setActionError('')
      queryClient.invalidateQueries({ queryKey: ['solicitudes-puesto-coordinador'] })
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo aceptar la solicitud de puesto')),
  })

  const rechazarSolicitudPuesto = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiClient.post(`/api/puestos/solicitudes/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      setActionError('')
      setRechazoSolicitudId(null)
      setMotivoRechazoSolicitud('')
      queryClient.invalidateQueries({ queryKey: ['solicitudes-puesto-coordinador'] })
      invalidateGestion()
    },
    onError: (err: unknown) => setActionError(parseApiError(err, 'No se pudo rechazar la solicitud de puesto')),
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
        || formatTipoPuesto(puesto.tipo).toLowerCase().includes(term)
        || puesto.admin.email.toLowerCase().includes(term)

      const coincideFiltro = (filtroPuestos === 'aprobados' && puesto.activo && puesto.estadoSolicitud === 'APROBADO')
        || (filtroPuestos === 'pendientes' && puesto.activo && puesto.estadoSolicitud === 'PENDIENTE')
        || (filtroPuestos === 'rechazados' && puesto.estadoSolicitud === 'RECHAZADO')

      return coincideTexto && coincideFiltro
    })
  }, [busquedaPuestos, filtroPuestos, puestos])

  const solicitudesPuestoFiltradas = useMemo(() => {
    const term = busquedaPuestos.trim().toLowerCase()
    const estado: SolicitudEstado = filtroPuestos === 'pendientes'
      ? 'PENDIENTE'
      : filtroPuestos === 'rechazados'
        ? 'RECHAZADA'
        : 'ACEPTADA'

    return solicitudesPuesto.filter((solicitud) => {
      const coincideTexto = !term
        || solicitud.nombre.toLowerCase().includes(term)
        || solicitud.direccion.toLowerCase().includes(term)
        || solicitud.tipo.toLowerCase().includes(term)
        || formatTipoPuesto(solicitud.tipo).toLowerCase().includes(term)
        || solicitud.usuario.email.toLowerCase().includes(term)
        || `${solicitud.usuario.nombre} ${solicitud.usuario.apellidos}`.toLowerCase().includes(term)

      return solicitud.estado === estado && coincideTexto
    })
  }, [busquedaPuestos, filtroPuestos, solicitudesPuesto])

  const puestosPendientes = useMemo(() => (
    solicitudesPuesto.filter((solicitud) => solicitud.estado === 'PENDIENTE')
  ), [solicitudesPuesto])

  const puestosActivos = useMemo(() => (
    puestos.filter((puesto) => puesto.activo && puesto.estadoSolicitud === 'APROBADO')
  ), [puestos])

  const puestosConNecesidades = useMemo(() => (
    puestosActivos
      .filter((puesto) => puesto.necesitaRecursos || puesto.necesitaVoluntarios || puesto.solicitudesPendientes > 0)
      .sort((a, b) => (
        b.solicitudesPendientes - a.solicitudesPendientes
        || Number(b.necesitaRecursos) - Number(a.necesitaRecursos)
        || Number(b.necesitaVoluntarios) - Number(a.necesitaVoluntarios)
      ))
  ), [puestosActivos])

  const incidenciasCortadas = useMemo(() => (
    incidencias.filter((incidencia) => incidencia.estado === 'CORTADA')
  ), [incidencias])

  const usuariosSinVerificar = useMemo(() => (
    usuarios.filter((usuario) => usuario.activo && !usuario.emailVerified)
  ), [usuarios])

  const loadingInicial = isLoadingPuestos || isLoadingSolicitudesPuesto || isLoadingIncidencias || isLoadingUsuarios
  const usuariosActivos = usuarios.filter((usuario) => usuario.activo).length
  const trabajoPendiente = puestosPendientes.length + puestosConNecesidades.length + usuariosSinVerificar.length

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

  return (
    <div className="min-h-full bg-slate-50 pb-8">
      <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coordinacion</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">Panel operativo</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Gestiona permisos, puestos y la salud general de la aplicacion desde una vista limpia.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xl font-semibold text-slate-950">{trabajoPendiente}</span>
              <span className="text-xs font-medium text-slate-500">elementos a revisar</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
            {[
              { id: 'resumen', label: 'Resumen' },
              { id: 'puestos', label: 'Puestos' },
              { id: 'incidencias', label: 'Incidencias' },
              { id: 'usuarios', label: 'Usuarios' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setVista(tab.id as Vista)}
                className={`rounded-md px-2 py-2 text-sm font-medium transition ${
                  vista === tab.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
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

      {vista === 'resumen' && (
        <section className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6">
          {loadingInicial ? (
            <LoadingState />
          ) : (
            <div className="space-y-5">
              <Panel title="Gestion pendiente" text="Acciones administrativas que mantienen la aplicacion ordenada.">
                <div className="divide-y divide-slate-100">
                  <ActionRow
                    title="Validar nuevos puestos"
                    text={puestosPendientes.length > 0
                      ? 'Solicitudes listas para revisar.'
                      : 'Sin solicitudes pendientes.'}
                    value={puestosPendientes.length}
                    tone={puestosPendientes.length > 0 ? 'warning' : 'muted'}
                    actionLabel="Revisar"
                    onAction={() => {
                      setVista('puestos')
                      setFiltroPuestos('pendientes')
                    }}
                  />
                  <ActionRow
                    title="Revisar actividad de incidencias"
                    text={incidencias.length > 0
                      ? 'Consulta incidencias y voluntarios asignados.'
                      : 'Todavia no hay incidencias registradas.'}
                    value={incidencias.length}
                    tone={incidenciasCortadas.length > 0 ? 'warning' : 'muted'}
                    actionLabel="Consultar"
                    onAction={() => {
                      setVista('incidencias')
                      setFiltroIncidencias('todas')
                    }}
                  />
                  <ActionRow
                    title="Supervisar puestos activos"
                    text={puestosConNecesidades.length > 0
                      ? 'Puestos con recursos, personal o solicitudes pendientes.'
                      : 'Sin avisos administrativos en puestos activos.'}
                    value={puestosConNecesidades.length}
                    tone={puestosConNecesidades.length > 0 ? 'warning' : 'muted'}
                    actionLabel="Ver"
                    onAction={() => {
                      setVista('puestos')
                      setFiltroPuestos('aprobados')
                    }}
                  />
                </div>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Panel title="Puestos con avisos" text="Informacion de seguimiento administrativo.">
                  {puestosConNecesidades.length === 0 ? (
                    <CompactEmpty text="No hay avisos de puestos ahora mismo." />
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {puestosConNecesidades.slice(0, 5).map((puesto) => (
                        <button
                          key={puesto.id}
                          type="button"
                          onClick={() => {
                            setDetailError('')
                            setDetalleId(puesto.id)
                          }}
                          className="grid w-full gap-2 py-3 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-950">{puesto.nombre}</p>
                            <p className="truncate text-xs text-slate-500">{puesto.direccion}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5 sm:justify-end">
                            {puesto.solicitudesPendientes > 0 && <Badge variant="warning">{puesto.solicitudesPendientes} solicitudes</Badge>}
                            {puesto.necesitaVoluntarios && <Badge variant="info">Falta gente</Badge>}
                            {puesto.necesitaRecursos && <Badge variant="danger">Faltan recursos</Badge>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Resumen" text="Lectura rapida de la plataforma.">
                  <div className="divide-y divide-slate-100">
                    <Metric label="Puestos activos" value={String(puestosActivos.length)} />
                    <Metric label="Vias cortadas" value={String(incidenciasCortadas.length)} />
                    <Metric label="Usuarios activos" value={String(usuariosActivos)} />
                    <Metric label="Usuarios sin verificar" value={String(usuariosSinVerificar.length)} />
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </section>
      )}

      {vista === 'puestos' && (
        <section className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6">
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
            {(isLoadingPuestos || isLoadingSolicitudesPuesto) ? (
              <LoadingState />
            ) : isErrorPuestos ? (
              <EmptyState title="No se pudieron cargar los puestos" text="Revisa que el backend este actualizado." />
            ) : filtroPuestos === 'pendientes' ? (
              solicitudesPuestoFiltradas.length === 0 ? (
                <EmptyState title="Sin solicitudes pendientes" text="No hay solicitudes de puesto pendientes que coincidan con la busqueda." />
              ) : (
                <div className="space-y-3">
                  {solicitudesPuestoFiltradas.map((solicitud) => (
                    <article key={solicitud.id} className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-gray-950">{solicitud.nombre}</h2>
                            {estadoSolicitudBadge(solicitud.estado)}
                          </div>
                          <p className="mt-1 text-sm text-gray-500">{solicitud.direccion}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={aceptarSolicitudPuesto.isPending}
                            onClick={() => aceptarSolicitudPuesto.mutate(solicitud.id)}
                          >
                            Aceptar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setActionError('')
                              setRechazoSolicitudId(solicitud.id)
                            }}
                          >
                            Rechazar
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        <CardMetric label="Tipo" value={formatTipoPuesto(solicitud.tipo)} />
                        <CardMetric label="Solicitante" value={`${solicitud.usuario.nombre} ${solicitud.usuario.apellidos}`} />
                        <CardMetric label="Fecha" value={fechaSolicitud(solicitud.createdAt) ?? '-'} />
                        <CardMetric label="Estado" value={solicitud.estado} />
                      </div>

                      <div className="mt-3 grid gap-1 text-xs text-gray-500">
                        <p>Email: {solicitud.usuario.email}</p>
                        {solicitud.usuario.telefono && <p>Telefono: {solicitud.usuario.telefono}</p>}
                        <p>Ubicacion: {solicitud.latitud.toFixed(4)}, {solicitud.longitud.toFixed(4)}</p>
                        {solicitud.descripcion && <p>{solicitud.descripcion}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : filtroPuestos === 'rechazados' && solicitudesPuestoFiltradas.length > 0 ? (
              <div className="space-y-3">
                {solicitudesPuestoFiltradas.map((solicitud) => (
                  <article key={solicitud.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-950">{solicitud.nombre}</h2>
                      {estadoSolicitudBadge(solicitud.estado)}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{solicitud.direccion}</p>
                    <div className="mt-3 grid gap-1 text-xs text-gray-500">
                      <p>Solicitante: {solicitud.usuario.nombre} {solicitud.usuario.apellidos} - {solicitud.usuario.email}</p>
                      {solicitud.motivoRechazo && <p>Motivo: {solicitud.motivoRechazo}</p>}
                      <p>Revisada: {fechaSolicitud(solicitud.decidedAt)}</p>
                    </div>
                  </article>
                ))}
              </div>
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
                      <CardMetric label="Tipo" value={formatTipoPuesto(puesto.tipo)} />
                      <CardMetric label="Personas" value={String(puesto.personasTotales)} />
                      <CardMetric label="Voluntarios" value={`${puesto.voluntariosActivos}/${puesto.capacidadTrabajo}`} />
                      <CardMetric label="Necesidades" value={String(puesto.necesidades)} />
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
        <section className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6">
          <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="font-semibold text-gray-950">Incidencias registradas</h2>
            <p className="text-xs text-gray-500">Consulta el estado de las incidencias y los voluntarios que se han unido.</p>
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
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setVoluntariosIncidenciaId(
                          voluntariosIncidenciaId === incidencia.id ? null : incidencia.id,
                        )}
                      >
                        {voluntariosIncidenciaId === incidencia.id ? 'Ocultar voluntarios' : 'Ver voluntarios'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:bg-red-50"
                        onClick={() => setIncidenciaAEliminar(incidencia)}
                      >
                        Eliminar
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
                                className="text-gray-500"
                                disabled
                              >
                                Asignado
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
        <section className="mx-auto w-full max-w-5xl px-4 pt-5 sm:px-6">
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
                    <div className="flex flex-wrap justify-end gap-2">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:bg-red-50"
                        onClick={() => setUsuarioAEliminar(usuario)}
                      >
                        Eliminar
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
              text={`Se eliminara "${incidenciaAEliminar.titulo || 'Incidencia en via'}" y sus asignaciones asociadas. Usa esta accion solo para registros erroneos o abuso.`}
            />
            <ModalActions onCancel={() => setIncidenciaAEliminar(null)}>
              <Button
                variant="danger"
                loading={eliminarIncidencia.isPending}
                onClick={() => eliminarIncidencia.mutate(incidenciaAEliminar.id)}
              >
                Eliminar incidencia
              </Button>
            </ModalActions>
          </div>
        </Modal>
      )}

      {usuarioAEliminar && (
        <Modal>
          <div className="space-y-4">
            <ModalTitle
              title="Eliminar usuario"
              text={`Se desactivara y anonimizara la cuenta de ${usuarioAEliminar.nombre} ${usuarioAEliminar.apellidos}. Se revocaran sus sesiones y se conservara el historial operativo.`}
            />
            <ModalActions onCancel={() => setUsuarioAEliminar(null)}>
              <Button
                variant="danger"
                loading={eliminarUsuario.isPending}
                onClick={() => eliminarUsuario.mutate(usuarioAEliminar.id)}
              >
                Eliminar usuario
              </Button>
            </ModalActions>
          </div>
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

      {rechazoSolicitudId && (
        <Modal>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              rechazarSolicitudPuesto.mutate({
                id: rechazoSolicitudId,
                motivo: motivoRechazoSolicitud.trim(),
              })
            }}
            className="space-y-3"
          >
            <ModalTitle title="Rechazar solicitud de puesto" text="Indica el motivo para que quede registrado en el historial." />
            <textarea
              value={motivoRechazoSolicitud}
              onChange={(e) => setMotivoRechazoSolicitud(e.target.value)}
              rows={3}
              required
              minLength={10}
              maxLength={500}
              placeholder="Falta informacion, ubicacion no operativa, capacidad insuficiente..."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <ModalActions onCancel={() => setRechazoSolicitudId(null)}>
              <Button type="submit" variant="danger" loading={rechazarSolicitudPuesto.isPending}>Rechazar</Button>
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
                  <CardMetric label="Capacidad voluntaria" value={String(detalle.puesto.capacidadTrabajo)} />
                  <CardMetric label="Voluntarios actuales" value={String(detalle.puesto.voluntariosActivos)} />
                  <CardMetric label="Plazas libres" value={String(Math.max(detalle.puesto.capacidadTrabajo - detalle.puesto.voluntariosActivos, 0))} />
                  <CardMetric label="Solicitudes pendientes" value={String(detalle.puesto.solicitudesPendientes)} />
                </div>

                {detailError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {detailError}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <DetailSection title="Responsable">
                    <p className="text-sm font-medium text-gray-950">
                      {detalle.puesto.admin.nombre} {detalle.puesto.admin.apellidos}
                    </p>
                    <p className="text-sm text-gray-500">{detalle.puesto.admin.email}</p>
                    {detalle.puesto.admin.telefono && (
                      <p className="mt-1 text-xs text-gray-500">{detalle.puesto.admin.telefono}</p>
                    )}
                  </DetailSection>

                  <DetailSection title="Voluntarios actuales">
                    <p className="mb-3 text-xs text-gray-500">
                      {detalle.puesto.voluntariosActivos} ocupadas de {detalle.puesto.capacidadTrabajo} plazas
                      {' - '}{Math.max(detalle.puesto.capacidadTrabajo - detalle.puesto.voluntariosActivos, 0)} libres
                    </p>
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
                </div>

                <DetailSection title="Recursos disponibles y necesidades">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase text-green-700">Disponibles</p>
                      {detalle.inventario.filter((item) => item.tipo === 'DISPONIBLE').length === 0 ? (
                        <p className="text-sm text-gray-500">Sin recursos disponibles registrados.</p>
                      ) : (
                        <div className="space-y-2">
                          {detalle.inventario.filter((item) => item.tipo === 'DISPONIBLE').map((item) => (
                            <p key={item.id} className="rounded-lg bg-green-50 px-3 py-2 text-sm text-gray-700">
                              {item.producto.nombre}: {item.cantidad} {item.producto.unidad}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase text-amber-700">Necesidades</p>
                      {detalle.inventario.filter((item) => item.tipo === 'NECESARIO').length === 0 ? (
                        <p className="text-sm text-gray-500">No hay necesidades pendientes registradas.</p>
                      ) : (
                        <div className="space-y-2">
                          {detalle.inventario.filter((item) => item.tipo === 'NECESARIO').map((item) => (
                            <p key={item.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-gray-700">
                              {item.producto.nombre}: {item.cantidad} {item.producto.unidad}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {detalle.donaciones.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <p className="mb-2 text-xs font-medium uppercase text-gray-500">Donaciones en curso</p>
                      <div className="space-y-2">
                        {detalle.donaciones.map((donacion) => (
                          <p key={donacion.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            {donacion.producto.nombre}: {donacion.cantidad} {donacion.unidad} - {donacion.estado}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </DetailSection>

                <DetailSection title="Solicitudes de voluntariado pendientes">
                  {detalle.solicitudesParticipacion.filter((solicitud) => solicitud.estado === 'PENDIENTE').length === 0 ? (
                    <p className="text-sm text-gray-500">No hay solicitudes pendientes para este puesto.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalle.solicitudesParticipacion.filter((solicitud) => solicitud.estado === 'PENDIENTE').map((solicitud) => (
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
                        </div>
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

                <DetailSection title="Gestion del equipo">
                  <p className="mb-3 text-xs text-gray-500">El puesto mantiene un responsable principal y voluntarios de apoyo.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <form
                      className="space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        cambiarResponsable.mutate({ id: detalle.puesto.id, email: responsableEmail })
                      }}
                    >
                      <p className="text-xs font-medium text-gray-600">Cambiar responsable principal</p>
                      <input
                        type="email"
                        list="coordinador-usuarios"
                        required
                        value={responsableEmail}
                        onChange={(e) => setResponsableEmail(e.target.value)}
                        placeholder="responsable@email.com"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <Button type="submit" size="sm" loading={cambiarResponsable.isPending}>Cambiar responsable</Button>
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
    <div className="flex items-center justify-between gap-3 py-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="shrink-0 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function Panel({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{text}</p>
      </div>
      {children}
    </section>
  )
}

function ActionRow({
  title,
  text,
  value,
  tone,
  actionLabel,
  onAction,
}: {
  title: string
  text: string
  value: number
  tone: 'danger' | 'warning' | 'muted'
  actionLabel: string
  onAction: () => void
}) {
  const toneClass = tone === 'danger'
    ? 'bg-red-50 text-red-700'
    : tone === 'warning'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-500'

  return (
    <div className="grid gap-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold ${toneClass}`}>
        {value}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-950">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{text}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

function CompactEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
      {text}
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
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === option.value
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
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
      <div className={`w-full rounded-lg border border-gray-200 bg-white p-4 shadow-xl ${wide ? 'max-w-4xl' : 'max-w-sm'}`}>
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
    CAMBIAR_RESPONSABLE_PUESTO: 'Responsable actualizado',
    ACEPTAR_PARTICIPACION_PUESTO: 'Participacion aceptada',
    RECHAZAR_PARTICIPACION_PUESTO: 'Participacion rechazada',
  }

  return labels[accion] ?? accion
}
