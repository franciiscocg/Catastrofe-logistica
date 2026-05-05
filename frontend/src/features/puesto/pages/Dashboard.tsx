import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
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
  catastrofe?: { id: string; nombre: string; fase: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nivelStock(cantidad: number): { label: string; variant: 'success' | 'info' | 'warning' | 'danger' } {
  if (cantidad <= 0)  return { label: 'Sin stock',  variant: 'danger'  }
  if (cantidad <= 5)  return { label: 'Crítico',    variant: 'danger'  }
  if (cantidad <= 20) return { label: 'Bajo',        variant: 'warning' }
  if (cantidad <= 50) return { label: 'Medio',       variant: 'info'    }
  return               { label: 'Alto',        variant: 'success' }
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
  onClose,
  onAdded,
}: {
  puestoId: string
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
    <div className={`bg-white border rounded-xl px-4 py-3 transition-colors ${
      item.tipo === 'NECESARIO' ? 'border-red-200 bg-red-50/30' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{CATEGORIA_EMOJI[item.producto.categoria] ?? '📦'}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{item.producto.nombre}</p>
            <p className="text-xs text-gray-400">{item.producto.categoria}</p>
          </div>
        </div>

        {item.tipo === 'NECESARIO' ? (
          <Badge variant="danger" className="flex-shrink-0">Necesitamos</Badge>
        ) : (
          <Badge variant={nivel.variant} className="flex-shrink-0">{nivel.label}</Badge>
        )}
      </div>

      {/* Controles de cantidad + eliminar */}
      <div className="flex items-center justify-between mt-3">
        {/* +/- cantidad */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateCantidad(item.id, -1)}
            disabled={item.cantidad <= 0}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 text-base font-bold"
          >
            −
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[4rem] text-center">
            {item.cantidad % 1 === 0 ? item.cantidad : item.cantidad.toFixed(1)} {item.producto.unidad}
          </span>
          <button
            onClick={() => onUpdateCantidad(item.id, +1)}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-base font-bold"
          >
            +
          </button>
        </div>

        {/* Eliminar */}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-600">¿Eliminar?</span>
            <button
              onClick={() => onDelete(item.id)}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded font-medium"
            >
              Sí
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-300 hover:text-red-500 transition-colors p-1"
            title="Eliminar"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  )
}

// ── Panel de gestión de trabajadores ─────────────────────────────────────────

interface Trabajador {
  id: string
  usuario: { id: string; nombre: string; apellidos: string; email: string }
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
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['trabajadores', puestoId],
    queryFn: () =>
      apiClient
        .get<{ trabajadores: Trabajador[] }>(`/api/puestos/${puestoId}/trabajadores`)
        .then((r) => r.data.trabajadores),
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    setAddError('')
    try {
      await apiClient.post(`/api/puestos/${puestoId}/trabajadores`, { email: email.trim() })
      setEmail('')
      qc.invalidateQueries({ queryKey: ['trabajadores', puestoId] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setAddError(msg ?? 'No se pudo añadir el trabajador')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (userId: string) => {
    await apiClient.delete(`/api/puestos/${puestoId}/trabajadores/${userId}`)
    qc.invalidateQueries({ queryKey: ['trabajadores', puestoId] })
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Acceso al puesto</p>
          <p className="font-semibold text-gray-900">Trabajadores y voluntarios</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">✕</button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 pb-6 pt-3 space-y-4">
        {/* Añadir trabajador — solo el admin */}
        {isAdmin && (
          <form onSubmit={handleAdd} className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Añadir por email</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="flex-1 rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <Button type="submit" size="sm" loading={adding} className="bg-amber-500 hover:bg-amber-600 flex-shrink-0">
                Añadir
              </Button>
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <p className="text-xs text-gray-400">
              La persona debe tener una cuenta registrada. Obtendrá acceso para modificar el inventario y escanear QRs.
            </p>
          </form>
        )}

        {/* Lista de trabajadores */}
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">
            {isLoading ? 'Cargando…' : `${data?.length ?? 0} trabajador${(data?.length ?? 0) !== 1 ? 'es' : ''}`}
          </p>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
            </div>
          ) : !data?.length ? (
            <p className="text-sm text-gray-400 italic text-center py-4">
              Aún no hay trabajadores añadidos
            </p>
          ) : (
            <div className="space-y-2">
              {data.map((t) => (
                <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.usuario.nombre} {t.usuario.apellidos}
                    </p>
                    <p className="text-xs text-gray-400">{t.usuario.email}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemove(t.usuario.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────

export default function PuestoDashboard() {
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showWorkers, setShowWorkers] = useState(false)
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
  // El usuario es admin si el puesto lo cargó por /api/puestos/:id (storedPuestoId)
  // y verificamos comparando con el campo adminId cuando la API lo devuelva.
  // Por ahora: es admin si fue quien creó el puesto (tiene puestoId en el store).
  // Los trabajadores acceden vía /mio pero no tienen storedPuestoId por defecto.
  const isAdmin = !!storedPuestoId && storedPuestoId === puesto?.id

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

  // Mutation: actualizar cantidad
  const mutCantidad = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      apiClient.patch(`/api/inventario/items/${id}/cantidad`, { delta }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] }),
  })

  // Mutation: eliminar
  const mutDelete = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/inventario/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventario', puesto?.id] }),
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

  const criticos = inventario.filter((i) => i.tipo === 'DISPONIBLE' && i.cantidad <= 5).length
  const necesitamos = inventario.filter((i) => i.tipo === 'NECESARIO').length

  // ── Loading / Sin puesto ──────────────────────────────────────────────────

  if (loadingPuesto) {
    return (
      <div className="flex items-center justify-center h-full pt-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (!puesto) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 pt-12 text-center">
        <p className="text-4xl mb-3">🏪</p>
        <p className="font-semibold text-gray-900 mb-1">Sin puesto asignado</p>
        <p className="text-sm text-gray-500">Tu cuenta no tiene ningún puesto de emergencia asociado todavía.</p>
      </div>
    )
  }

  // ── UI principal ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Cabecera del puesto */}
      <div className="bg-amber-500 text-white px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-100">
              {puesto.catastrofe?.nombre ?? 'Puesto activo'}
            </p>
            <p className="font-bold text-lg leading-tight">{puesto.nombre}</p>
            <p className="text-sm text-amber-100 mt-0.5">{puesto.direccion}</p>
          </div>
          <div className={`mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            puesto.activo ? 'bg-green-400/30 text-white' : 'bg-red-400/30 text-white'
          }`}>
            {puesto.activo ? 'Activo' : 'Inactivo'}
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-3 gap-2 flex-shrink-0">
        {[
          { label: 'Productos', value: inventario.filter((i) => i.tipo === 'DISPONIBLE').length, sub: 'disponibles' },
          { label: 'Críticos',  value: criticos,   sub: 'bajo stock' },
          { label: 'Necesitan', value: necesitamos, sub: 'urgentes'   },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-2.5 text-center">
            <p className={`text-xl font-bold ${s.value > 0 && s.label !== 'Productos' ? 'text-red-600' : 'text-gray-900'}`}>
              {s.value}
            </p>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros + botón añadir */}
      <div className="px-4 pb-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex gap-1 flex-1">
          {(['todos', 'DISPONIBLE', 'NECESARIO'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                filtro === f
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'border-gray-200 text-gray-500 hover:border-amber-300'
              }`}
            >
              {f === 'todos' ? 'Todos' : f === 'DISPONIBLE' ? 'Disponible' : 'Necesitamos'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="secondary" onClick={() => setShowQr(true)}>
            📷 QR
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowWorkers(true)}>
            👷
          </Button>
          <Button size="sm" onClick={() => setShowAddSheet(true)} className="bg-amber-500 hover:bg-amber-600">
            + Añadir
          </Button>
        </div>
      </div>

      {/* Lista de inventario */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        {loadingInv ? (
          <div className="flex justify-center pt-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
          </div>
        ) : listaFiltrada.length === 0 ? (
          <div className="text-center pt-8 text-gray-400">
            <p className="text-3xl mb-2">📦</p>
            <p className="text-sm">No hay productos en esta categoría</p>
            {filtro === 'todos' && (
              <button
                onClick={() => setShowAddSheet(true)}
                className="mt-3 text-sm text-amber-600 font-medium underline"
              >
                Añadir el primer producto
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
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
      </div>

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
      {showAddSheet && puesto && (
        <AddItemSheet
          puestoId={puesto.id}
          onClose={() => setShowAddSheet(false)}
          onAdded={() => qc.invalidateQueries({ queryKey: ['inventario', puesto.id] })}
        />
      )}
    </div>
  )
}
