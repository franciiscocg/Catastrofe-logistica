import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { ItemInventario } from '@/types/inventario.types'
import { Notice } from './DashboardUi'
import { SUGERENCIAS_INVENTARIO_PUESTO, normalizeInventarioProductoNombre, type InventarioPuestoCard, type OperacionInventarioPuesto } from './inventarioPuesto'

export function AddInventarioPuestoSheet({
  existingItems,
  onClose,
  onCreate,
}: {
  existingItems: ItemInventario[]
  onClose: () => void
  onCreate: (input: {
    nombre: string
    categoria: string
    unidad: string
    cantidad: number
    tipo: 'DISPONIBLE' | 'NECESARIO'
  }) => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [tipo, setTipo] = useState<'DISPONIBLE' | 'NECESARIO'>('DISPONIBLE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sugerencias = nombre.trim()
    ? SUGERENCIAS_INVENTARIO_PUESTO.filter((item) => (
        item.nombre.toLocaleLowerCase('es').includes(nombre.toLocaleLowerCase('es'))
      ))
    : SUGERENCIAS_INVENTARIO_PUESTO

  const seleccionar = (item: typeof SUGERENCIAS_INVENTARIO_PUESTO[number]) => {
    setNombre(item.nombre)
    setCategoria(item.categoria)
    setUnidad(item.unidad)
    setError('')
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedCantidad = Number(cantidad.replace(',', '.'))
    const existing = existingItems.find((item) => (
      normalizeInventarioProductoNombre(item.producto.nombre) === normalizeInventarioProductoNombre(nombre)
    ))
    if (existing) {
      setError(`"${existing.producto.nombre}" ya existe en el inventario. Edita la cantidad desde su tarjeta.`)
      return
    }

    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (!categoria.trim()) {
      setError('La categoría es obligatoria.')
      return
    }
    if (!unidad.trim()) {
      setError('La unidad es obligatoria.')
      return
    }
    if (Number.isNaN(parsedCantidad) || parsedCantidad < 0) {
      setError('Introduce una cantidad válida.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onCreate({
        nombre: nombre.trim(),
        categoria: categoria.trim(),
        unidad: unidad.trim(),
        cantidad: parsedCantidad,
        tipo,
      })
      onClose()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setError(message?.error ?? message?.message ?? 'No se pudo anadir el producto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-700">Inventario del puesto</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Anadir producto</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-sm font-medium text-slate-500 hover:text-slate-950 disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-500">Sugerencias rapidas</p>
          <div className="flex flex-wrap gap-2">
            {sugerencias.slice(0, 8).map((item) => (
              <button
                key={item.nombre}
                type="button"
                onClick={() => seleccionar(item)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-cyan-400 hover:text-cyan-800"
              >
                {item.nombre}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
              placeholder="Agua, mantas, medicamentos..."
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Categoría</label>
              <input
                value={categoria}
                onChange={(event) => setCategoria(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
                placeholder="Bebidas, Sanidad..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Unidad</label>
              <input
                value={unidad}
                onChange={(event) => setUnidad(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
                placeholder="unidades, kg, litros..."
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={cantidad}
                onChange={(event) => setCantidad(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
              <select
                value={tipo}
                onChange={(event) => setTipo(event.target.value as 'DISPONIBLE' | 'NECESARIO')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
              >
                <option value="DISPONIBLE">Disponible en el puesto</option>
                <option value="NECESARIO">Necesario / hace falta</option>
              </select>
            </div>
          </div>

          {error && <Notice tone="danger">{error}</Notice>}

          <Button type="submit" fullWidth loading={loading}>
            Guardar producto
          </Button>
        </form>
      </div>
    </div>
  )
}

export function OperacionInventarioPuestoSheet({
  card,
  operacion,
  onClose,
  onApply,
  onAdjust,
}: {
  card: InventarioPuestoCard
  operacion: OperacionInventarioPuesto
  onClose: () => void
  onApply: (card: InventarioPuestoCard, operacion: OperacionInventarioPuesto, cantidad: number) => Promise<void>
  onAdjust: (card: InventarioPuestoCard, disponible: number, necesario: number) => Promise<void>
}) {
  const isNecesario = card.estado === 'necesario'
  const cantidadActual = isNecesario ? card.cantidadNecesaria : card.cantidadDisponible
  const unidad = card.producto.unidad
  const [cantidad, setCantidad] = useState(operacion === 'ajuste' ? String(cantidadActual) : '')
  const [cantidadDisponible, setCantidadDisponible] = useState(String(card.cantidadDisponible))
  const [cantidadNecesaria, setCantidadNecesaria] = useState(String(card.cantidadNecesaria))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const title = operacion === 'entrada'
    ? isNecesario ? 'Registrar llegada' : 'Entrada de stock'
    : operacion === 'salida'
      ? isNecesario ? 'Aumentar falta' : 'Salida de stock'
      : operacion === 'necesidad'
        ? 'Marcar como necesario'
        : 'Ajustar inventario'
  const help = operacion === 'entrada'
    ? isNecesario
      ? 'Resta de lo que falta. Si llega más de lo pendiente, el sobrante pasa a disponible.'
      : 'Suma material que acaba de entrar al puesto.'
    : operacion === 'salida'
      ? isNecesario
        ? 'Aumenta la cantidad que falta.'
        : 'Resta material entregado o retirado del puesto.'
      : operacion === 'necesidad'
        ? 'Descarta primero el stock disponible y publica como urgente solo lo que siga faltando.'
        : 'Fija por separado lo que hay físicamente y lo que hace falta pedir.'

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operacion === 'ajuste') {
      const parsedDisponible = Number(cantidadDisponible.replace(',', '.'))
      const parsedNecesario = Number(cantidadNecesaria.replace(',', '.'))
      if (
        Number.isNaN(parsedDisponible) ||
        Number.isNaN(parsedNecesario) ||
        parsedDisponible < 0 ||
        parsedNecesario < 0
      ) {
        setError('Introduce cantidades válidas.')
        return
      }
      if (parsedDisponible > 0 && parsedNecesario > 0) {
        setError('No puedes guardar stock disponible y necesidad a la vez. Deja una de las dos cantidades a 0.')
        return
      }

      setLoading(true)
      setError('')
      try {
        await onAdjust(card, parsedDisponible, parsedNecesario)
        onClose()
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
          : undefined
        setError(message?.error ?? message?.message ?? (err instanceof Error ? err.message : 'No se pudo ajustar el inventario.'))
      } finally {
        setLoading(false)
      }
      return
    }

    const parsed = Number(cantidad.replace(',', '.'))
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('Introduce una cantidad válida.')
      return
    }
    if (parsed === 0) {
      setError('La cantidad debe ser mayor que cero.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onApply(card, operacion, parsed)
      onClose()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
        : undefined
      setError(message?.error ?? message?.message ?? (err instanceof Error ? err.message : 'No se pudo actualizar el inventario.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end bg-slate-950/40 px-4 py-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-700">{title}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{card.producto.nombre}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {operacion === 'ajuste'
                ? `Actual: ${card.cantidadDisponible} ${unidad} disponibles y ${card.cantidadNecesaria} ${unidad} necesarios.`
                : `Actual: ${cantidadActual} ${unidad}.`} {help}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-sm font-medium text-slate-500 hover:text-slate-950 disabled:opacity-60"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {operacion === 'ajuste' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">Stock disponible</label>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.1"
                  value={cantidadDisponible}
                  onChange={(event) => {
                    setCantidadDisponible(event.target.value)
                    setError('')
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-600"
                  placeholder={`0 ${unidad}`}
                />
                <p className="mt-2 text-xs text-slate-500">Lo que hay ahora mismo en el puesto.</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">Necesidad</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={cantidadNecesaria}
                  onChange={(event) => {
                    setCantidadNecesaria(event.target.value)
                    setError('')
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-600"
                  placeholder={`0 ${unidad}`}
                />
                <p className="mt-2 text-xs text-slate-500">Lo que hace falta pedir o reponer.</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad</label>
              <input
                autoFocus
                type="number"
                min="0"
                step="0.1"
                value={cantidad}
                onChange={(event) => {
                  setCantidad(event.target.value)
                  setError('')
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-600"
                placeholder={`0 ${unidad}`}
              />
            </div>
          )}
          {operacion !== 'ajuste' && (
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 5, 10].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCantidad(String(value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-cyan-400 hover:text-cyan-800"
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" fullWidth loading={loading}>
            Aplicar
          </Button>
        </form>
      </div>
    </div>
  )
}

