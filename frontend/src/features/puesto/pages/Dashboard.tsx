import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import { useGeolocation } from '@/hooks/useGeolocation'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import QrScanner from '@/components/shared/QrScanner'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Producto {
  id: string
  nombre: string
  categoria: string
  unidad: string
}

interface ItemInventario {
  id: string
  cantidad: number
  tipo: 'DISPONIBLE' | 'NECESARIO'
  producto: Producto
}

interface Puesto {
  id: string
  nombre: string
  direccion: string
  tipo: string
  activo: boolean
  esAdmin?: boolean
  catastrofe?: { id: string; nombre: string; fase: string }
}

interface SolicitudPuesto {
  id: string
  nombre: string
  direccion: string
  tipo: string
  descripcion?: string | null
  latitud: number
  longitud: number
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
  motivoRechazo?: string | null
  createdAt: string
}

interface HistorialInventario {
  id: string
  accion: string
  createdAt: string
  datos?: {
    itemId?: string
    producto?: Producto
    tipo?: 'DISPONIBLE' | 'NECESARIO'
    cantidadAnterior?: number
    cantidadNueva?: number
    delta?: number
  } | null
  usuario?: { id: string; nombre: string; apellidos: string; email: string } | null
}

interface DonacionPuesto {
  id: string
  cantidad: number
  unidad: string
  estado: 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'
  comentario?: string | null
  eta?: string | null
  createdAt: string
  producto: Producto
  voluntario: {
    usuario: { id: string; nombre: string; apellidos: string; email: string; telefono?: string | null }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nivelStock(cantidad: number): { label: string; variant: 'success' | 'info' | 'warning' | 'danger' } {
  if (cantidad <= 0)  return { label: 'Sin stock',  variant: 'danger'  }
  if (cantidad <= 5)  return { label: 'Crítico',    variant: 'danger'  }
  if (cantidad <= 20) return { label: 'Bajo',        variant: 'warning' }
  if (cantidad <= 50) return { label: 'Medio',       variant: 'info'    }
  return               { label: 'Alto',        variant: 'success' }
}

function formatCantidad(cantidad?: number) {
  if (cantidad === undefined) return '0'
  return cantidad % 1 === 0 ? String(cantidad) : cantidad.toFixed(1)
}

function accionHistorialLabel(accion: string) {
  if (accion === 'INVENTARIO_CREADO') return 'Creado'
  if (accion === 'INVENTARIO_INCREMENTADO') return 'Sumado'
  if (accion === 'INVENTARIO_ACTUALIZADO') return 'Actualizado'
  if (accion === 'INVENTARIO_ELIMINADO') return 'Eliminado'
  return 'Movimiento'
}

function formatFechaHistorial(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatFechaCorta(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()

  return new Intl.DateTimeFormat('es-ES', {
    ...(isToday ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatLlegadaEstimada(value?: string | null) {
  const formatted = formatFechaCorta(value)
  if (!formatted) return null

  return `Llegada estimada: ${formatted}`
}

function estadoDonacionBadge(estado: DonacionPuesto['estado']) {
  if (estado === 'EN_CAMINO') return <Badge variant="info">En camino</Badge>
  if (estado === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  if (estado === 'ENTREGADA') return <Badge variant="success">Entregada</Badge>
  return <Badge variant="danger">Cancelada</Badge>
}

function normalizeProductoNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es')
}

const CATEGORIA_EMOJI: Record<string, string> = {
  Bebidas: '💧', Alimentación: '🍱', Abrigo: '🛏', Sanidad: '💊',
  Ropa: '🧥', Bebés: '👶', Equipamiento: '🔦', Higiene: '🧴',
  Herramientas: '🔧', Calzado: '👟', Movilidad: '♿', Limpieza: '🧹',
}

// Productos frecuentes para autocompletar al añadir
const SUGERENCIAS_PRODUCTOS = [
  { nombre: 'Agua embotellada',         categoria: 'Bebidas',       unidad: 'litros'    },
  { nombre: 'Alimentos no perecederos', categoria: 'Alimentación',  unidad: 'kg'        },
  { nombre: 'Mantas',                   categoria: 'Abrigo',        unidad: 'unidades'  },
  { nombre: 'Medicamentos básicos',     categoria: 'Sanidad',       unidad: 'kits'      },
  { nombre: 'Ropa de abrigo',           categoria: 'Ropa',          unidad: 'prendas'   },
  { nombre: 'Pañales',                  categoria: 'Bebés',         unidad: 'paquetes'  },
  { nombre: 'Linternas y pilas',        categoria: 'Equipamiento',  unidad: 'unidades'  },
  { nombre: 'Productos de higiene',     categoria: 'Higiene',       unidad: 'kits'      },
  { nombre: 'Generadores eléctricos',   categoria: 'Equipamiento',  unidad: 'unidades'  },
  { nombre: 'Sacos de dormir',          categoria: 'Abrigo',        unidad: 'unidades'  },
  { nombre: 'Calzado',                  categoria: 'Calzado',       unidad: 'pares'     },
  { nombre: 'Sillas de ruedas',         categoria: 'Movilidad',     unidad: 'unidades'  },
]

// ── Panel de añadir producto ──────────────────────────────────────────────────

function AddItemSheet({
  puestoId,
  existingItems,
  onClose,
  onAdded,
}: {
  puestoId: string
  existingItems: ItemInventario[]
  onClose: () => void
  onAdded: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [tipo, setTipo] = useState<'DISPONIBLE' | 'NECESARIO'>('DISPONIBLE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filtradas = nombre.trim().length > 0
    ? SUGERENCIAS_PRODUCTOS.filter((s) =>
        s.nombre.toLocaleLowerCase('es').includes(nombre.toLocaleLowerCase('es'))
      )
    : SUGERENCIAS_PRODUCTOS

  const seleccionar = (s: typeof SUGERENCIAS_PRODUCTOS[0]) => {
    setNombre(s.nombre)
    setCategoria(s.categoria)
    setUnidad(s.unidad)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cant = parseFloat(cantidad)
    const existing = existingItems.find((item) => (
      normalizeProductoNombre(item.producto.nombre) === normalizeProductoNombre(nombre)
    ))
    if (existing) {
      setError(`"${existing.producto.nombre}" ya existe en el inventario. Edita la cantidad desde su tarjeta.`)
      return
    }
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!categoria.trim()) { setError('La categoría es obligatoria'); return }
    if (!unidad.trim()) { setError('La unidad es obligatoria'); return }
    if (isNaN(cant) || cant < 0) { setError('Cantidad inválida'); return }

    setLoading(true)
    setError('')
    try {
      await apiClient.post(`/api/inventario/puesto/${puestoId}/items`, {
        nombre: nombre.trim(),
        categoria: categoria.trim(),
        unidad: unidad.trim(),
        cantidad: cant,
        tipo,
      })
      onAdded()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Error al añadir el producto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <p className="font-semibold text-gray-900">Añadir producto</p>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">✕</button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3">
        {/* Sugerencias rápidas */}
        <p className="text-xs text-gray-500 mb-2">Productos frecuentes:</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {filtradas.slice(0, 8).map((s) => (
            <button
              key={s.nombre}
              type="button"
              onClick={() => seleccionar(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                nombre === s.nombre
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-amber-400'
              }`}
            >
              {CATEGORIA_EMOJI[s.categoria] ?? '📦'} {s.nombre}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del producto"
              className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Categoría *</label>
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Bebidas, Ropa..."
                className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unidad *</label>
              <input
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="litros, kg, unidades..."
                className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad *</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'DISPONIBLE' | 'NECESARIO')}
                className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="DISPONIBLE">Disponible</option>
                <option value="NECESARIO">Necesitamos</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" fullWidth loading={loading} className="bg-amber-500 hover:bg-amber-600">
            Añadir al inventario
          </Button>
        </form>
      </div>
    </div>
  )
}

// ── Fila de inventario ────────────────────────────────────────────────────────

function InventarioRow({
  item,
  onUpdateCantidad,
  onDelete,
}: {
  item: ItemInventario
  onUpdateCantidad: (id: string, delta: number) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nivel = nivelStock(item.cantidad)

  return (
    <article className={`rounded-lg border bg-white px-4 py-3 shadow-sm transition-colors ${
      item.tipo === 'NECESARIO' ? 'border-red-200 bg-red-50/40' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            item.tipo === 'NECESARIO' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
          }`}>
            {item.producto.categoria.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-950">{item.producto.nombre}</p>
            <p className="mt-0.5 text-xs text-gray-500">{item.producto.categoria}</p>
          </div>
        </div>

        {item.tipo === 'NECESARIO' ? (
          <Badge variant="danger" className="flex-shrink-0">Solicitud</Badge>
        ) : (
          <Badge variant={nivel.variant} className="flex-shrink-0">{nivel.label}</Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => onUpdateCantidad(item.id, -1)}
            disabled={item.cantidad <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-md text-base font-semibold text-gray-600 hover:bg-white disabled:opacity-30"
            aria-label={`Reducir ${item.producto.nombre}`}
          >
            -
          </button>
          <span className="min-w-[5.25rem] truncate px-2 text-center text-sm font-semibold text-gray-950">
            {item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(1)} {item.producto.unidad}
          </span>
          <button
            type="button"
            onClick={() => onUpdateCantidad(item.id, +1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-base font-semibold text-gray-600 hover:bg-white"
            aria-label={`Aumentar ${item.producto.nombre}`}
          >
            +
          </button>
        </div>

        {confirmDelete ? (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex-shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Eliminar"
          >
            Eliminar
          </button>
        )}
      </div>
    </article>
  )
}

function HistorialInventarioSheet({
  historial,
  loading,
  onClose,
}: {
  historial: HistorialInventario[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[2400] bg-black/40 flex items-end sm:items-center sm:justify-center">
      <div className="bg-white w-full max-h-[88vh] sm:max-w-2xl sm:rounded-xl rounded-t-2xl overflow-hidden shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Historial</p>
            <h2 className="text-lg font-bold text-gray-900">Movimientos de inventario</h2>
            <p className="text-sm text-gray-500">Ultimas entradas, salidas, ajustes y eliminaciones.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">x</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
            </div>
          ) : historial.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">Todavia no hay movimientos registrados.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map((movimiento) => {
                const datos = movimiento.datos ?? {}
                const producto = datos.producto
                const unidad = producto?.unidad ?? ''
                const delta = datos.delta ?? ((datos.cantidadNueva ?? 0) - (datos.cantidadAnterior ?? 0))
                const usuario = movimiento.usuario
                  ? `${movimiento.usuario.nombre} ${movimiento.usuario.apellidos}`.trim()
                  : 'Sistema'
                const tipoLabel = datos.tipo === 'NECESARIO' ? 'Necesario' : 'Disponible'

                return (
                  <div key={movimiento.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {producto?.nombre ?? 'Producto eliminado'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {accionHistorialLabel(movimiento.accion)} · {tipoLabel} · {usuario}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatFechaHistorial(movimiento.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                        {formatCantidad(datos.cantidadAnterior)} -&gt; {formatCantidad(datos.cantidadNueva)} {unidad}
                      </span>
                      <span className={`rounded-full px-2 py-1 font-medium ${
                        delta >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {delta >= 0 ? '+' : ''}{formatCantidad(delta)} {unidad}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SolicitudParticipacion {
  id: string
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
  motivoRechazo?: string | null
  createdAt: string
  usuario: { id: string; nombre: string; apellidos: string; email: string; dni?: string | null; telefono?: string | null }
}

interface ParticipantePuesto {
  id: string
  startedAt: string
  usuario: { id: string; nombre: string; apellidos: string; email: string; dni?: string | null; telefono?: string | null }
}

function WorkersSheet({
  puestoId,
  isAdmin,
  onClose,
}: {
  puestoId: string
  isAdmin: boolean
  onClose: () => void
}) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const qc = useQueryClient()

  const { data: solicitudes, isLoading: loadingSolicitudes } = useQuery({
    queryKey: ['solicitudes-participacion', puestoId],
    queryFn: () =>
      apiClient
        .get<{ solicitudes: SolicitudParticipacion[] }>(`/api/puestos/${puestoId}/solicitudes-participacion`)
        .then((r) => r.data.solicitudes),
  })

  const { data: participantes, isLoading: loadingParticipantes } = useQuery({
    queryKey: ['participantes-puesto', puestoId],
    queryFn: () =>
      apiClient
        .get<{ participantes: ParticipantePuesto[] }>(`/api/puestos/${puestoId}/participantes`)
        .then((r) => r.data.participantes),
  })

  const pendientes = solicitudes?.filter((s) => s.estado === 'PENDIENTE') ?? []

  const decisionSolicitud = useMutation({
    mutationFn: ({ solicitudId, decision }: { solicitudId: string; decision: 'aceptar' | 'rechazar' }) =>
      apiClient.post(`/api/puestos/participaciones/${solicitudId}/${decision}`, {}),
    onSuccess: () => {
      setActionError('')
      qc.invalidateQueries({ queryKey: ['solicitudes-participacion', puestoId] })
      qc.invalidateQueries({ queryKey: ['participantes-puesto', puestoId] })
      qc.invalidateQueries({ queryKey: ['inventario', puestoId] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg ?? 'No se pudo actualizar la solicitud')
    },
  })

  const removeParticipante = useMutation({
    mutationFn: (asignacionId: string) => apiClient.delete(`/api/puestos/${puestoId}/participantes/${asignacionId}`),
    onSuccess: () => {
      setActionError('')
      setConfirmRemoveId(null)
      qc.invalidateQueries({ queryKey: ['participantes-puesto', puestoId] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg ?? 'No se pudo quitar el voluntario')
    },
  })

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] flex max-h-[80vh] flex-col rounded-t-2xl bg-white shadow-2xl">
      <div className="flex justify-center pb-1 pt-3">
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Voluntarios</p>
          <p className="font-semibold text-gray-900">Solicitudes y personas activas</p>
          <p className="mt-0.5 text-sm text-gray-500">Revisa peticiones de apoyo y consulta quien esta colaborando ahora.</p>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">x</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-3">
        {actionError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-950">Solicitudes pendientes</h3>
            <Badge variant={pendientes.length > 0 ? 'warning' : 'default'}>{pendientes.length}</Badge>
          </div>

          {loadingSolicitudes ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-amber-500" />
            </div>
          ) : pendientes.length ? (
            <div className="space-y-2">
              {pendientes.map((solicitud) => (
                <div key={solicitud.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {solicitud.usuario.nombre} {solicitud.usuario.apellidos}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600">DNI: {solicitud.usuario.dni ?? 'No informado'}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{solicitud.usuario.email}</p>
                    </div>
                    <Badge variant="warning">Pendiente</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      loading={
                        decisionSolicitud.isPending
                        && decisionSolicitud.variables?.solicitudId === solicitud.id
                        && decisionSolicitud.variables?.decision === 'aceptar'
                      }
                      disabled={decisionSolicitud.isPending}
                      onClick={() => decisionSolicitud.mutate({ solicitudId: solicitud.id, decision: 'aceptar' })}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={
                        decisionSolicitud.isPending
                        && decisionSolicitud.variables?.solicitudId === solicitud.id
                        && decisionSolicitud.variables?.decision === 'rechazar'
                      }
                      disabled={decisionSolicitud.isPending}
                      onClick={() => decisionSolicitud.mutate({ solicitudId: solicitud.id, decision: 'rechazar' })}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No hay solicitudes pendientes</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-950">Voluntarios activos</h3>
            <Badge variant={participantes?.length ? 'success' : 'default'}>{participantes?.length ?? 0}</Badge>
          </div>

          {loadingParticipantes ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-amber-500" />
            </div>
          ) : !participantes?.length ? (
            <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">Aun no hay voluntarios activos</p>
          ) : (
            <div className="space-y-2">
              {participantes.map((participante) => (
                <div key={participante.id} className="flex items-start justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {participante.usuario.nombre} {participante.usuario.apellidos}
                    </p>
                    <p className="text-xs text-gray-500">DNI: {participante.usuario.dni ?? 'No informado'}</p>
                    {participante.usuario.telefono && (
                      <p className="text-xs text-gray-500">Telefono: {participante.usuario.telefono}</p>
                    )}
                  </div>
                  {isAdmin && confirmRemoveId === participante.id && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => removeParticipante.mutate(participante.id)}
                        disabled={removeParticipante.isPending}
                        className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        disabled={removeParticipante.isPending}
                        className="rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {isAdmin && confirmRemoveId !== participante.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(participante.id)}
                      disabled={removeParticipante.isPending}
                      className="flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SolicitudPuestoForm() {
  const qc = useQueryClient()
  const { position, request: requestLocation, loading: loadingLocation } = useGeolocation()
  const [form, setForm] = useState({
    nombre: '',
    direccion: '',
    tipo: '',
    descripcion: '',
    latitud: '',
    longitud: '',
  })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['mi-solicitud-puesto'],
    queryFn: () =>
      apiClient
        .get<{ solicitud: SolicitudPuesto | null }>('/api/puestos/solicitudes/mia')
        .then((r) => r.data.solicitud),
  })

  const solicitud = data ?? null

  useEffect(() => {
    if (solicitud?.estado !== 'RECHAZADA') return
    setForm({
      nombre: solicitud.nombre,
      direccion: solicitud.direccion,
      tipo: solicitud.tipo,
      descripcion: solicitud.descripcion ?? '',
      latitud: String(solicitud.latitud),
      longitud: String(solicitud.longitud),
    })
  }, [solicitud])

  useEffect(() => {
    if (!position || form.latitud || form.longitud) return
    setForm((prev) => ({
      ...prev,
      latitud: position.lat.toFixed(6),
      longitud: position.lng.toFixed(6),
    }))
  }, [form.latitud, form.longitud, position])

  const crearSolicitud = useMutation({
    mutationFn: () => {
      const latitud = parseFloat(form.latitud)
      const longitud = parseFloat(form.longitud)
      if (!form.nombre.trim()) throw new Error('El nombre del puesto es obligatorio')
      if (!form.direccion.trim()) throw new Error('La direccion es obligatoria')
      if (!form.tipo.trim()) throw new Error('Indica el tipo de instalacion')
      if (Number.isNaN(latitud) || latitud < -90 || latitud > 90) throw new Error('Latitud invalida')
      if (Number.isNaN(longitud) || longitud < -180 || longitud > 180) throw new Error('Longitud invalida')

      return apiClient.post('/api/puestos/solicitudes', {
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim(),
        tipo: form.tipo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        latitud,
        longitud,
      })
    },
    onSuccess: () => {
      setError('')
      setForm({
        nombre: '',
        direccion: '',
        tipo: '',
        descripcion: '',
        latitud: '',
        longitud: '',
      })
      qc.invalidateQueries({ queryKey: ['mi-solicitud-puesto'] })
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'No se pudo enviar la solicitud')
    },
  })

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setError('')
    }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (solicitud?.estado === 'PENDIENTE') {
    return (
      <div className="px-5 pt-12 pb-6">
        <div className="bg-white border border-amber-200 rounded-xl p-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Pendiente</p>
          <p className="font-semibold text-gray-900 mt-2">Solicitud enviada</p>
          <p className="text-sm text-gray-500 mt-1">
            {solicitud.nombre} esta esperando revision de coordinacion.
          </p>
          <div className="mt-4 text-left bg-amber-50 rounded-lg p-3 text-sm text-amber-900">
            <p className="font-medium">{solicitud.direccion}</p>
            <p className="text-xs mt-1">{solicitud.latitud}, {solicitud.longitud}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 pt-8 pb-6">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Puesto</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Crear solicitud de puesto</h1>
        <p className="text-sm text-gray-500 mt-1">
          Completa los datos del puesto para que coordinacion pueda revisarlo y activarlo.
        </p>
      </div>

      {solicitud?.estado === 'RECHAZADA' && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p className="font-medium">Solicitud rechazada</p>
          {solicitud.motivoRechazo && <p className="mt-1">{solicitud.motivoRechazo}</p>}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          crearSolicitud.mutate()
        }}
        className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
      >
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del puesto</label>
          <input value={form.nombre} onChange={set('nombre')} className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Calle o direccion</label>
          <input value={form.direccion} onChange={set('direccion')} className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de instalacion</label>
          <input value={form.tipo} onChange={set('tipo')} placeholder="Colegio, pabellon, almacen..." className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Latitud</label>
            <input type="number" step="0.000001" value={form.latitud} onChange={set('latitud')} className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Longitud</label>
            <input type="number" step="0.000001" value={form.longitud} onChange={set('longitud')} className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          loading={loadingLocation}
          onClick={() => {
            if (position) {
              setForm((prev) => ({
                ...prev,
                latitud: position.lat.toFixed(6),
                longitud: position.lng.toFixed(6),
              }))
              return
            }
            requestLocation()
          }}
        >
          Usar ubicacion actual
        </Button>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descripcion</label>
          <textarea value={form.descripcion} onChange={set('descripcion')} rows={3} className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <Button type="submit" fullWidth loading={crearSolicitud.isPending} className="bg-amber-500 hover:bg-amber-600">
          Enviar solicitud
        </Button>
      </form>
    </div>
  )
}

export default function PuestoDashboard() {
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showWorkers, setShowWorkers] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [qrResult, setQrResult] = useState<{ text: string; ts: number } | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'DISPONIBLE' | 'NECESARIO'>('todos')
  const qc = useQueryClient()

  const { puestoId: storedPuestoId } = useAuthStore()

  // Cargar detalles del puesto:
  // - Si tenemos puestoId en el store → fetch directo a /api/puestos/:id
  // - Si no → fallback a /api/puestos/mio (primera vez o sesión antigua)
  const { data: puestoData, isLoading: loadingPuesto } = useQuery({
    queryKey: ['puesto-detalle', storedPuestoId],
    queryFn: async () => {
      if (storedPuestoId) {
        const r = await apiClient.get<{ puesto: Puesto }>(`/api/puestos/${storedPuestoId}`)
        return r.data.puesto
      }
      const r = await apiClient.get<{ puestos: Puesto[] }>('/api/puestos/mio')
      return r.data.puestos?.[0] ?? null
    },
  })

  const puesto = puestoData ?? null
  const isAdmin = puesto?.esAdmin === true || (!!storedPuestoId && storedPuestoId === puesto?.id)

  // Cargar inventario
  const { data: invData, isLoading: loadingInv } = useQuery({
    queryKey: ['inventario', puesto?.id],
    queryFn: () =>
      apiClient
        .get<{ inventario: ItemInventario[] }>(`/api/inventario/puesto/${puesto!.id}`)
        .then((r) => r.data),
    enabled: !!puesto?.id,
  })

  const inventario = invData?.inventario ?? []

  const { data: solicitudesParticipacionData } = useQuery({
    queryKey: ['solicitudes-participacion', puesto?.id],
    queryFn: () =>
      apiClient
        .get<{ solicitudes: SolicitudParticipacion[] }>(`/api/puestos/${puesto!.id}/solicitudes-participacion`)
        .then((r) => r.data.solicitudes),
    enabled: !!puesto?.id,
  })

  const { data: participantesData } = useQuery({
    queryKey: ['participantes-puesto', puesto?.id],
    queryFn: () =>
      apiClient
        .get<{ participantes: ParticipantePuesto[] }>(`/api/puestos/${puesto!.id}/participantes`)
        .then((r) => r.data.participantes),
    enabled: !!puesto?.id,
  })

  const { data: donacionesData, isLoading: loadingDonaciones } = useQuery({
    queryKey: ['donaciones-puesto', puesto?.id],
    queryFn: () =>
      apiClient
        .get<{ donaciones: DonacionPuesto[] }>(`/api/puestos/${puesto!.id}/donaciones`)
        .then((r) => r.data.donaciones),
    enabled: !!puesto?.id,
  })

  const { data: historialData, isLoading: loadingHistorial } = useQuery({
    queryKey: ['inventario-historial', puesto?.id],
    queryFn: () =>
      apiClient
        .get<{ historial: HistorialInventario[] }>(`/api/inventario/puesto/${puesto!.id}/historial`)
        .then((r) => r.data.historial),
    enabled: !!puesto?.id && showHistory,
  })

  const historialInventario = historialData ?? []
  const donacionesPuesto = donacionesData ?? []

  // Mutation: actualizar cantidad
  const mutCantidad = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      apiClient.patch(`/api/inventario/items/${id}/cantidad`, { delta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] })
      qc.invalidateQueries({ queryKey: ['inventario-historial', puesto?.id] })
    },
  })

  // Mutation: eliminar
  const mutDelete = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/inventario/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] })
      qc.invalidateQueries({ queryKey: ['inventario-historial', puesto?.id] })
    },
  })

  const handleUpdateCantidad = useCallback((id: string, delta: number) => {
    mutCantidad.mutate({ id, delta })
  }, [mutCantidad])

  const handleDelete = useCallback((id: string) => {
    mutDelete.mutate(id)
  }, [mutDelete])

  // Filtrado
  const listaFiltrada = filtro === 'todos'
    ? inventario
    : inventario.filter((i) => i.tipo === filtro)
  const inventarioTitle =
    filtro === 'DISPONIBLE' ? 'Tenemos disponible'
    : filtro === 'NECESARIO' ? 'Necesitamos recibir'
    : 'Inventario operativo'
  const inventarioDescription =
    filtro === 'DISPONIBLE' ? 'Productos que el puesto puede entregar o utilizar ahora.'
    : filtro === 'NECESARIO' ? 'Necesidades abiertas que conviene priorizar.'
    : 'Vista conjunta de stock disponible y necesidades abiertas.'

  const criticos = inventario.filter((i) => i.tipo === 'DISPONIBLE' && i.cantidad <= 5).length
  const necesitamos = inventario.filter((i) => i.tipo === 'NECESARIO').length
  const disponibles = inventario.filter((i) => i.tipo === 'DISPONIBLE')
  const solicitudesPendientes = solicitudesParticipacionData?.filter((s) => s.estado === 'PENDIENTE').length ?? 0
  const voluntariosActivos = participantesData?.length ?? 0
  const unidadesDisponibles = disponibles.reduce((total, item) => total + item.cantidad, 0)
  const unidadesNecesarias = inventario
    .filter((i) => i.tipo === 'NECESARIO')
    .reduce((total, item) => total + item.cantidad, 0)

  // ── Loading / Sin puesto ──────────────────────────────────────────────────

  if (loadingPuesto) {
    return (
      <div className="flex items-center justify-center h-full pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (!puesto) return <SolicitudPuestoForm />

  if (!puesto) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 pt-12 text-center">
        <p className="text-4xl mb-3">🏪</p>
        <p className="font-semibold text-gray-900 mb-1">Sin puesto asignado</p>
        <p className="text-sm text-gray-500">Tu cuenta no tiene ningún puesto de emergencia asociado todavía.</p>
      </div>
    )
  }

  if (!puesto.activo) {
    return <Navigate to="/auth/registro-puesto" replace />
  }

  // ── UI principal ──────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full flex-col bg-slate-100">

      <section className="flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase text-amber-700">Panel operativo</p>
              <Badge variant={puesto.activo ? 'success' : 'danger'}>{puesto.activo ? 'Activo' : 'Inactivo'}</Badge>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-gray-950 sm:text-2xl">{puesto.nombre}</h1>
            <p className="mt-1 text-sm text-gray-500">{puesto.direccion}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Tenemos', value: disponibles.length, helper: 'productos en stock', tone: 'text-gray-950' },
              { label: 'Críticos', value: criticos, helper: 'requieren revisión', tone: criticos > 0 ? 'text-red-600' : 'text-gray-950' },
              { label: 'Necesitamos', value: necesitamos, helper: 'peticiones abiertas', tone: necesitamos > 0 ? 'text-amber-700' : 'text-gray-950' },
              { label: 'Unidades', value: formatCantidad(unidadesDisponibles), helper: 'disponibles totales', tone: 'text-gray-950' },
              { label: 'Solicitudes', value: solicitudesPendientes, helper: 'voluntarios esperando', tone: solicitudesPendientes > 0 ? 'text-amber-700' : 'text-gray-950' },
              { label: 'Voluntarios', value: voluntariosActivos, helper: 'activos ahora', tone: 'text-emerald-700' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className={`text-xl font-semibold ${stat.tone}`}>{stat.value}</p>
                <p className="text-xs font-medium text-slate-600">{stat.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{stat.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button size="sm" onClick={() => setShowAddSheet(true)} className="bg-amber-600 hover:bg-amber-700">
              Añadir producto
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowQr(true)}>
              Escanear QR
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowHistory(true)}>
              Historial
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowWorkers(true)}>
              Voluntarios
            </Button>
          </div>

          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1">
            {([
              ['todos', 'Todo'],
              ['DISPONIBLE', 'Tenemos'],
              ['NECESARIO', 'Necesitamos'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition sm:min-w-[6.5rem] ${
                  filtro === id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">Entregas en camino</h2>
            <p className="text-sm text-gray-500">Donaciones pendientes o en ruta hacia este puesto.</p>
          </div>
          <Badge variant={donacionesPuesto.length > 0 ? 'info' : 'default'}>{donacionesPuesto.length}</Badge>
        </div>

        {loadingDonaciones ? (
          <div className="flex justify-center rounded-lg border border-slate-200 bg-slate-50 py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-amber-600" />
          </div>
        ) : donacionesPuesto.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
            No hay entregas pendientes o en camino ahora mismo.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {donacionesPuesto.slice(0, 4).map((donacion) => {
              const voluntario = donacion.voluntario.usuario
              const llegada = formatLlegadaEstimada(donacion.eta)

              return (
                <article key={donacion.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-950">
                        {formatCantidad(donacion.cantidad)} {donacion.unidad} de {donacion.producto.nombre}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        {voluntario.nombre} {voluntario.apellidos}
                      </p>
                      {voluntario.telefono && (
                        <p className="text-xs text-slate-500">Telefono: {voluntario.telefono}</p>
                      )}
                    </div>
                    {estadoDonacionBadge(donacion.estado)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {llegada && <span className="rounded-full bg-white px-2 py-1">{llegada}</span>}
                    {donacion.comentario && (
                      <span className="rounded-full bg-white px-2 py-1">{donacion.comentario}</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-950">{inventarioTitle}</h2>
            <p className="text-sm text-gray-500">
              {inventarioDescription} {listaFiltrada.length} registros visibles
              {unidadesNecesarias > 0 ? ` - ${formatCantidad(unidadesNecesarias)} unidades solicitadas` : ''}
            </p>
          </div>
          {(mutCantidad.isPending || mutDelete.isPending) && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Actualizando</span>
          )}
        </div>

        {loadingInv ? (
          <div className="flex justify-center rounded-lg border border-slate-200 bg-white py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-amber-600" />
          </div>
        ) : listaFiltrada.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <p className="text-sm font-semibold text-gray-950">No hay productos en esta vista</p>
            <p className="mt-1 text-sm text-gray-500">
              {filtro === 'todos'
                ? 'Registra el primer producto para empezar a operar el inventario.'
                : 'Cambia el filtro o registra un nuevo producto para esta categoría.'}
            </p>
            {filtro === 'todos' && (
              <Button
                size="sm"
                onClick={() => setShowAddSheet(true)}
                className="mt-4 bg-amber-600 hover:bg-amber-700"
              >
                Añadir producto
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {listaFiltrada.map((item) => (
              <InventarioRow
                key={item.id}
                item={item}
                onUpdateCantidad={handleUpdateCantidad}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Resultado del último QR escaneado */}
      {qrResult && (
        <div className="fixed bottom-4 left-4 right-4 z-[2500] bg-green-600 text-white rounded-xl px-4 py-3 shadow-lg flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-200">QR escaneado</p>
            <p className="text-sm font-medium break-all mt-0.5">{qrResult.text}</p>
          </div>
          <button onClick={() => setQrResult(null)} className="flex-shrink-0 text-green-200 hover:text-white">✕</button>
        </div>
      )}

      {/* Escáner QR */}
      {showQr && (
        <QrScanner
          onResult={(text) => {
            setQrResult({ text, ts: Date.now() })
            setShowQr(false)
          }}
          onClose={() => setShowQr(false)}
        />
      )}

      {/* Panel de trabajadores */}
      {showWorkers && puesto && (
        <WorkersSheet
          puestoId={puesto.id}
          isAdmin={isAdmin}
          onClose={() => setShowWorkers(false)}
        />
      )}

      {/* Panel añadir producto */}
      {showHistory && (
        <HistorialInventarioSheet
          historial={historialInventario}
          loading={loadingHistorial}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showAddSheet && puesto && (
        <AddItemSheet
          puestoId={puesto.id}
          existingItems={inventario}
          onClose={() => setShowAddSheet(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ['inventario', puesto.id] })
            qc.invalidateQueries({ queryKey: ['inventario-historial', puesto.id] })
          }}
        />
      )}
    </div>
  )
}
