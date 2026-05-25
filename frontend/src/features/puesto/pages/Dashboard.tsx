import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import { useGeolocation } from '@/hooks/useGeolocation'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import QrScanner from '@/components/shared/QrScanner'
import { puestoApi } from '../api/puestoApi'
import EntregasPanel from '../components/EntregasPanel'
import PuestoSummaryHeader from '../components/PuestoSummaryHeader'
import PuestoToolbar from '../components/PuestoToolbar'

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

type InventarioAgrupado = {
  key: string
  producto: Producto
  disponible?: ItemInventario
  necesario?: ItemInventario
  cantidadDisponible: number
  cantidadNecesaria: number
  balance: number
  estado: 'SOBRANTE' | 'FALTANTE' | 'CUBIERTO' | 'SIN_MOVIMIENTO'
  itemActivo: ItemInventario
}

interface Puesto {
  id: string
  nombre: string
  direccion: string
  tipo: string
  activo: boolean
  esAdmin?: boolean
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

type QrProducto = {
  productoId?: string
  nombre?: string
  categoria?: string
  cantidad: number
  unidad: string
}

type QrOperativo =
  | {
      type: 'SOLICITUD_CIUDADANO'
      requestId?: string
      puestoId: string
      puestoNombre?: string
      productos: QrProducto[]
      generatedAt?: string
    }
  | {
      type: 'DONACION_ENTREGA'
      entregaCodigo?: string
      donacionId?: string
      puestoId: string
      productoId: string
      productoNombre?: string
      productoCategoria?: string
      cantidad: number
      unidad: string
      generatedAt?: string
    }

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

function agruparInventario(items: ItemInventario[]): InventarioAgrupado[] {
  const grouped = new Map<string, {
    producto: Producto
    disponible?: ItemInventario
    necesario?: ItemInventario
  }>()

  for (const item of items) {
    const key = item.producto.id
    const current = grouped.get(key) ?? { producto: item.producto }
    if (item.tipo === 'DISPONIBLE') current.disponible = item
    if (item.tipo === 'NECESARIO') current.necesario = item
    grouped.set(key, current)
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const cantidadDisponible = group.disponible?.cantidad ?? 0
      const cantidadNecesaria = group.necesario?.cantidad ?? 0
      const balance = cantidadDisponible - cantidadNecesaria
      const estado: InventarioAgrupado['estado'] = balance > 0
        ? 'SOBRANTE'
        : balance < 0
          ? 'FALTANTE'
          : cantidadDisponible > 0 || cantidadNecesaria > 0
            ? 'CUBIERTO'
            : 'SIN_MOVIMIENTO'
      const itemActivo = estado === 'FALTANTE'
        ? group.necesario!
        : group.disponible ?? group.necesario!

      return {
        key,
        producto: group.producto,
        disponible: group.disponible,
        necesario: group.necesario,
        cantidadDisponible,
        cantidadNecesaria,
        balance,
        estado,
        itemActivo,
      }
    })
    .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es'))
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

function normalizeProductoNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es')
}

function generatedAtFromTimestamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseQrOperativo(text: string): QrOperativo | null {
  try {
    const data = JSON.parse(text) as Partial<QrOperativo> & {
      t?: string
      r?: string
      p?: string
      pn?: string
      i?: Array<{ n?: string; c?: string; q?: number; u?: string }>
      e?: string
      d?: string
      pr?: string
      n?: string
      c?: string
      q?: number
      u?: string
      g?: number
    }
    if (data.t === 'SC' && data.p && Array.isArray(data.i)) {
      return {
        type: 'SOLICITUD_CIUDADANO',
        requestId: data.r,
        puestoId: data.p,
        puestoNombre: data.pn,
        productos: data.i
          .filter((item) => item.n && typeof item.q === 'number' && Number.isFinite(item.q) && item.q > 0 && item.u)
          .map((item) => ({
            nombre: item.n,
            categoria: item.c,
            cantidad: item.q!,
            unidad: item.u!,
          })),
        generatedAt: generatedAtFromTimestamp(data.g),
      }
    }
    if (data.t === 'DE' && data.p && data.pr && typeof data.q === 'number' && Number.isFinite(data.q) && data.q > 0 && data.u) {
      return {
        type: 'DONACION_ENTREGA',
        entregaCodigo: data.e,
        donacionId: data.d,
        puestoId: data.p,
        productoId: data.pr,
        productoNombre: data.n,
        productoCategoria: data.c,
        cantidad: data.q,
        unidad: data.u,
        generatedAt: generatedAtFromTimestamp(data.g),
      }
    }
    if (data.type === 'SOLICITUD_CIUDADANO' && Array.isArray(data.productos) && data.puestoId) {
      return data as QrOperativo
    }
    if (
      data.type === 'DONACION_ENTREGA' &&
      data.puestoId &&
      (data as { productoId?: string }).productoId &&
      typeof (data as { cantidad?: unknown }).cantidad === 'number' &&
      Number.isFinite((data as { cantidad: number }).cantidad) &&
      (data as { cantidad: number }).cantidad > 0
    ) {
      return data as QrOperativo
    }
  } catch {
    return null
  }
  return null
}

function productosFromQr(qr: QrOperativo, inventario: ItemInventario[]): QrProducto[] {
  if (qr.type === 'SOLICITUD_CIUDADANO') return qr.productos
  const item = inventario.find((inv) => inv.producto.id === qr.productoId)
  return [{
    productoId: qr.productoId,
    nombre: item?.producto.nombre ?? qr.productoNombre ?? qr.productoId,
    categoria: item?.producto.categoria ?? qr.productoCategoria,
    cantidad: qr.cantidad,
    unidad: qr.unidad,
  }]
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
      await puestoApi.crearItem(puestoId, {
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
  onUpdateBalance,
  onDelete,
}: {
  item: InventarioAgrupado
  onUpdateBalance: (item: InventarioAgrupado, delta: number) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const unidad = item.producto.unidad
  const netoAbs = Math.abs(item.balance)
  const nivel = nivelStock(Math.max(item.balance, 0))
  const cantidadLabel = formatCantidad(netoAbs)
  const estadoLabel = item.estado === 'FALTANTE'
    ? `Faltan ${cantidadLabel} ${unidad}`
    : item.estado === 'SOBRANTE'
      ? `Disponible ${cantidadLabel} ${unidad}`
      : 'Necesidad cubierta'
  const borderClass = item.estado === 'FALTANTE'
    ? 'border-red-200 bg-red-50/30'
    : item.estado === 'CUBIERTO'
      ? 'border-emerald-200 bg-emerald-50/30'
      : 'border-gray-200'
  const deleteId = item.itemActivo.id

  return (
    <article className={`rounded-lg border px-3 py-2 shadow-sm transition-colors hover:border-gray-300 ${borderClass}`}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_1.7fr_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
            item.estado === 'FALTANTE' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
          }`}>
            {item.producto.categoria.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-950">{item.producto.nombre}</p>
            <p className="truncate text-xs text-gray-500">{item.producto.categoria}</p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className={`text-sm font-semibold ${item.estado === 'FALTANTE' ? 'text-red-700' : 'text-emerald-700'}`}>
            {estadoLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Stock {formatCantidad(item.cantidadDisponible)} · necesidad abierta {formatCantidad(item.cantidadNecesaria)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
          {item.estado === 'FALTANTE' ? (
            <Badge variant="danger" className="flex-shrink-0">Faltante</Badge>
          ) : item.estado === 'CUBIERTO' ? (
            <Badge variant="success" className="flex-shrink-0">Cubierto</Badge>
          ) : (
            <Badge variant={nivel.variant} className="flex-shrink-0">{nivel.label}</Badge>
          )}
          <button
            type="button"
            onClick={() => onUpdateBalance(item, -1)}
            disabled={item.estado === 'SIN_MOVIMIENTO' && !item.disponible && !item.necesario}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-30"
          >
            Salida
          </button>
            <button
              type="button"
              onClick={() => onUpdateBalance(item, +1)}
              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Entrada
            </button>

        {confirmDelete ? (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDelete(deleteId)}
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
      puestoApi.getParticipantes<ParticipantePuesto>(puestoId).then((r) => r.data.participantes),
  })

  const pendientes = solicitudes?.filter((s) => s.estado === 'PENDIENTE') ?? []

  const decisionSolicitud = useMutation({
    mutationFn: ({ solicitudId, decision }: { solicitudId: string; decision: 'aceptar' | 'rechazar' }) =>
      puestoApi.decidirParticipacion(solicitudId, decision),
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
    mutationFn: (asignacionId: string) => puestoApi.quitarParticipante(puestoId, asignacionId),
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
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [qrResult, setQrResult] = useState<{ text: string; parsed: QrOperativo | null; ts: number } | null>(null)
  const [qrConfirmando, setQrConfirmando] = useState(false)
  const [qrError, setQrError] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'DISPONIBLE' | 'NECESARIO'>('todos')
  const [inventarioSearch, setInventarioSearch] = useState('')
  const qc = useQueryClient()

  const { puestoId: storedPuestoId } = useAuthStore()

  // Cargar detalles del puesto:
  // - Si tenemos puestoId en el store → fetch directo a /api/puestos/:id
  // - Si no → fallback a /api/puestos/mio (primera vez o sesión antigua)
  const { data: puestoData, isLoading: loadingPuesto } = useQuery({
    queryKey: ['puesto-detalle', storedPuestoId],
    queryFn: async () => {
      if (storedPuestoId) {
        const r = await puestoApi.getPuesto<Puesto>(storedPuestoId)
        return r.data.puesto
      }
      const r = await puestoApi.getMiPuesto<Puesto>()
      return r.data.puestos?.[0] ?? null
    },
  })

  const puesto = puestoData ?? null
  const isAdmin = puesto?.esAdmin === true || (!!storedPuestoId && storedPuestoId === puesto?.id)

  // Cargar inventario
  const { data: invData, isLoading: loadingInv } = useQuery({
    queryKey: ['inventario', puesto?.id],
    queryFn: () =>
      puestoApi.getInventario<ItemInventario>(puesto!.id).then((r) => r.data),
    enabled: !!puesto?.id,
  })

  const inventario = invData?.inventario ?? []

  const { data: solicitudesParticipacionData } = useQuery({
    queryKey: ['solicitudes-participacion', puesto?.id],
    queryFn: () =>
      puestoApi.getSolicitudesParticipacion<SolicitudParticipacion>(puesto!.id).then((r) => r.data.solicitudes),
    enabled: !!puesto?.id,
  })

  const { data: participantesData } = useQuery({
    queryKey: ['participantes-puesto', puesto?.id],
    queryFn: () =>
      puestoApi.getParticipantes<ParticipantePuesto>(puesto!.id).then((r) => r.data.participantes),
    enabled: !!puesto?.id,
  })

  const { data: donacionesData, isLoading: loadingDonaciones } = useQuery({
    queryKey: ['donaciones-puesto', puesto?.id],
    queryFn: () =>
      puestoApi.getDonaciones<DonacionPuesto>(puesto!.id).then((r) => r.data.donaciones),
    enabled: !!puesto?.id,
  })

  const { data: historialData, isLoading: loadingHistorial } = useQuery({
    queryKey: ['inventario-historial', puesto?.id],
    queryFn: () =>
      puestoApi.getHistorial<HistorialInventario>(puesto!.id).then((r) => r.data.historial),
    enabled: !!puesto?.id && showHistory,
  })

  const historialInventario = historialData ?? []
  const donacionesPuesto = donacionesData ?? []
  const donacionesActivas = donacionesPuesto.filter((donacion) =>
    donacion.estado === 'PENDIENTE' || donacion.estado === 'EN_CAMINO',
  )

  // Mutation: actualizar cantidad
  const mutCantidad = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      puestoApi.ajustarCantidad(id, delta),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] })
      qc.invalidateQueries({ queryKey: ['inventario-historial', puesto?.id] })
    },
  })

  const mutCreateInventario = useMutation({
    mutationFn: ({ producto, tipo, cantidad }: { producto: Producto; tipo: 'DISPONIBLE' | 'NECESARIO'; cantidad: number }) =>
      puestoApi.crearItem(puesto!.id, {
        nombre: producto.nombre,
        categoria: producto.categoria,
        unidad: producto.unidad,
        cantidad,
        tipo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] })
      qc.invalidateQueries({ queryKey: ['inventario-historial', puesto?.id] })
    },
  })

  // Mutation: eliminar
  const mutDelete = useMutation({
    mutationFn: (id: string) => puestoApi.eliminarItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] })
      qc.invalidateQueries({ queryKey: ['inventario-historial', puesto?.id] })
    },
  })

  const handleUpdateBalance = useCallback((item: InventarioAgrupado, delta: number) => {
    if (delta > 0) {
      if (item.cantidadNecesaria > 0 && item.necesario) {
        mutCantidad.mutate({ id: item.necesario.id, delta: -delta })
        return
      }
      if (item.disponible) {
        mutCantidad.mutate({ id: item.disponible.id, delta })
        return
      }
      mutCreateInventario.mutate({ producto: item.producto, tipo: 'DISPONIBLE', cantidad: delta })
      return
    }

    const absDelta = Math.abs(delta)
    if (item.cantidadDisponible > 0 && item.disponible) {
      mutCantidad.mutate({ id: item.disponible.id, delta })
      return
    }
    if (item.necesario) {
      mutCantidad.mutate({ id: item.necesario.id, delta: absDelta })
      return
    }
    mutCreateInventario.mutate({ producto: item.producto, tipo: 'NECESARIO', cantidad: absDelta })
  }, [mutCantidad, mutCreateInventario])

  const handleDelete = useCallback((id: string) => {
    mutDelete.mutate(id)
  }, [mutDelete])

  const handleConfirmarQr = useCallback(async () => {
    if (!qrResult?.parsed || !puesto?.id) return
    const qr = qrResult.parsed
    if (qr.puestoId !== puesto.id) {
      setQrError('Este QR pertenece a otro puesto.')
      return
    }

    setQrConfirmando(true)
    setQrError('')
    try {
      await puestoApi.confirmarQr(puesto.id, qrResult.text)
      await qc.invalidateQueries({ queryKey: ['inventario', puesto.id] })
      await qc.invalidateQueries({ queryKey: ['inventario-historial', puesto.id] })
      await qc.invalidateQueries({ queryKey: ['mis-donaciones'] })
      setQrResult(null)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; details?: Array<{ message?: string }> } } }).response?.data
      const detail = data?.details?.[0]?.message
      const message = data?.error && data.error !== 'Bad Request' ? data.error : detail
      setQrError(message ?? 'No se pudo confirmar el QR. Revisa la conexion e intentalo de nuevo.')
    } finally {
      setQrConfirmando(false)
    }
  }, [puesto?.id, qc, qrResult])

  // Filtrado
  const inventarioAgrupado = agruparInventario(inventario)
  const inventarioOrdenado = [...inventarioAgrupado].sort((a, b) => {
    const urgenciaA = a.balance < 0 ? 0 : a.cantidadDisponible > 0 && a.cantidadDisponible <= 5 ? 1 : 2
    const urgenciaB = b.balance < 0 ? 0 : b.cantidadDisponible > 0 && b.cantidadDisponible <= 5 ? 1 : 2
    return urgenciaA - urgenciaB || a.producto.nombre.localeCompare(b.producto.nombre, 'es')
  })
  const searchNorm = inventarioSearch.trim().toLocaleLowerCase('es')
  const listaFiltrada = (filtro === 'todos'
    ? inventarioOrdenado
    : inventarioOrdenado.filter((i) => (
        filtro === 'DISPONIBLE' ? i.balance > 0 : i.balance < 0
      )))
    .filter((i) => !searchNorm || (
      i.producto.nombre.toLocaleLowerCase('es').includes(searchNorm) ||
      i.producto.categoria.toLocaleLowerCase('es').includes(searchNorm)
    ))
  const inventarioTitle =
    filtro === 'DISPONIBLE' ? 'Tenemos disponible'
    : filtro === 'NECESARIO' ? 'Necesitamos recibir'
    : 'Inventario operativo'
  const criticos = inventarioAgrupado.filter((i) => i.balance > 0 && i.balance <= 5).length
  const necesitamos = inventarioAgrupado.filter((i) => i.balance < 0).length
  const disponibles = inventarioAgrupado.filter((i) => i.balance > 0)
  const solicitudesPendientes = solicitudesParticipacionData?.filter((s) => s.estado === 'PENDIENTE').length ?? 0
  const voluntariosActivos = participantesData?.length ?? 0
  const unidadesDisponibles = disponibles.reduce((total, item) => total + item.balance, 0)
  const unidadesNecesarias = inventarioAgrupado
    .filter((i) => i.balance < 0)
    .reduce((total, item) => total + Math.abs(item.balance), 0)
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
      <PuestoSummaryHeader
        nombre={puesto.nombre}
        direccion={puesto.direccion}
        activo={puesto.activo}
        stats={[
          { label: 'Disponible neto', value: disponibles.length, helper: 'productos con sobrante', tone: 'text-gray-950' },
          { label: 'Criticos', value: criticos, helper: 'requieren revision', tone: criticos > 0 ? 'text-red-600' : 'text-gray-950' },
          { label: 'Faltan', value: necesitamos, helper: 'productos sin cubrir', tone: necesitamos > 0 ? 'text-amber-700' : 'text-gray-950' },
          { label: 'Unid. netas', value: formatCantidad(unidadesDisponibles), helper: 'sobrante total', tone: 'text-gray-950' },
          { label: 'Solicitudes', value: solicitudesPendientes, helper: 'voluntarios esperando', tone: solicitudesPendientes > 0 ? 'text-amber-700' : 'text-gray-950' },
          { label: 'Voluntarios', value: voluntariosActivos, helper: 'activos ahora', tone: 'text-emerald-700' },
        ]}
      />

      <PuestoToolbar
        filtro={filtro}
        inventarioSearch={inventarioSearch}
        onAdd={() => setShowAddSheet(true)}
        onScanQr={() => setShowQr(true)}
        onHistory={() => setShowHistory(true)}
        onWorkers={() => setShowWorkers(true)}
        onSearchChange={setInventarioSearch}
        onFiltroChange={setFiltro}
      />

      <EntregasPanel
        donaciones={donacionesActivas}
        loading={loadingDonaciones}
        visible={showDeliveries}
        onToggle={() => setShowDeliveries((current) => !current)}
      />

      <section className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6">
        {(necesitamos > 0 || criticos > 0) && (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium">
              {necesitamos} productos faltan tras compensar stock y necesidades
              {criticos > 0 ? ` - ${criticos} critico${criticos === 1 ? '' : 's'}` : ''}
            </p>
            <div className="flex gap-2">
              {necesitamos > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltro('NECESARIO')}
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
                >
                  Ver necesidades
                </button>
              )}
              {criticos > 0 && (
                <button
                  type="button"
                  onClick={() => setFiltro('DISPONIBLE')}
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200"
                >
                  Ver criticos
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950">{inventarioTitle}</h2>
            <p className="text-xs text-gray-500 sm:text-sm">
              {listaFiltrada.length} productos visibles
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
          <div className="grid gap-2">
            {listaFiltrada.map((item) => (
              <InventarioRow
                key={item.key}
                item={item}
                onUpdateBalance={handleUpdateBalance}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Resultado del último QR escaneado */}
      {qrResult && (
        <div className="fixed bottom-4 left-4 right-4 z-[2500] max-h-[70vh] overflow-y-auto rounded-xl bg-white px-4 py-3 text-slate-900 shadow-2xl ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">QR escaneado</p>
              <p className="text-sm font-semibold text-slate-950">
                {qrResult.parsed?.type === 'SOLICITUD_CIUDADANO'
                  ? 'Solicitud de ciudadano'
                  : qrResult.parsed?.type === 'DONACION_ENTREGA'
                    ? 'Donacion entrante'
                    : 'Formato no reconocido'}
              </p>
            </div>
            <button onClick={() => setQrResult(null)} className="flex-shrink-0 text-slate-400 hover:text-slate-700">x</button>
          </div>

          {qrResult.parsed ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">
                  {qrResult.parsed.type === 'SOLICITUD_CIUDADANO'
                    ? 'Al confirmar, se restaran estos productos del inventario disponible.'
                    : 'Al confirmar, se sumara la donacion al inventario disponible.'}
                </p>
                <div className="mt-2 space-y-1">
                  {productosFromQr(qrResult.parsed, inventario).map((producto) => (
                    <div key={`${producto.productoId ?? producto.nombre}-${producto.cantidad}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">
                        {producto.categoria ? `${CATEGORIA_EMOJI[producto.categoria] ?? ''} ` : ''}{producto.nombre ?? producto.productoId}
                      </span>
                      <span className="flex-shrink-0 font-semibold">
                        {formatCantidad(producto.cantidad)} {producto.unidad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {qrError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{qrError}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setQrResult(null)}>Cancelar</Button>
                <Button loading={qrConfirmando} onClick={() => void handleConfirmarQr()}>
                  Confirmar
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 break-all rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {qrResult.text}
            </p>
          )}
        </div>
      )}

      {/* Escáner QR */}
      {showQr && (
        <QrScanner
          onResult={(text) => {
            setQrResult({ text, parsed: parseQrOperativo(text), ts: Date.now() })
            setQrError('')
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
