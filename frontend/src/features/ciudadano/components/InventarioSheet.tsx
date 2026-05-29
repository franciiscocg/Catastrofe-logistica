import { useQuery } from '@tanstack/react-query'
import Badge from '@/components/ui/Badge'
import { apiClient } from '@/lib/api/client'
import type { PuestoMarker } from '@/components/shared/Map'

const CATEGORIA_EMOJI: Record<string, string> = {
  Bebidas: '💧', Alimentación: '🍱', Abrigo: '🛏', Sanidad: '💊',
  Ropa: '🧥', Bebés: '👶', Equipamiento: '🔦', Higiene: '🧴',
  Herramientas: '🔧', Calzado: '👟', Movilidad: '♿',
}

export default function InventarioSheet({
  puesto,
  onClose,
}: {
  puesto: PuestoMarker
  onClose: () => void
}) {
  const { data: apiInv, isLoading } = useQuery({
    queryKey: ['inventario-ciudadano', puesto.id],
    queryFn: () =>
      apiClient
        .get<{ inventario: Array<{ id: string; tipo: string; cantidad: number; producto: { nombre: string; categoria: string; unidad: string } }> }>(
          `/api/inventario/puesto/${puesto.id}`,
        )
        .then((r) => {
          const disponible = r.data.inventario
            .filter((i) => i.tipo === 'DISPONIBLE')
            .map((i) => ({ nombre: i.producto.nombre, categoria: i.producto.categoria, cantidad: i.cantidad, unidad: i.producto.unidad }))
          const necesario = r.data.inventario
            .filter((i) => i.tipo === 'NECESARIO')
            .map((i) => ({ nombre: i.producto.nombre, categoria: i.producto.categoria, cantidad: i.cantidad, unidad: i.producto.unidad }))
          return { disponible, necesario }
        }),
    staleTime: 1000 * 30,
    retry: false,
  })

  const inv = apiInv ?? { disponible: [], necesario: [] }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[70vh]">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Cabecera */}
      <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Inventario</p>
          <p className="font-semibold text-gray-900">{puesto.nombre}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Contenido scrollable */}
      <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-5 pt-3">

        {isLoading && (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        )}

        {/* Disponible */}
        <section>
          <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Disponible ({inv.disponible.length})
          </h3>
          {inv.disponible.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin productos disponibles</p>
          ) : (
            <div className="space-y-1">
              {inv.disponible.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {item.cantidad} {item.unidad}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Necesario */}
        {inv.necesario.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Necesitamos ({inv.necesario.length})
            </h3>
            <div className="space-y-1">
              {inv.necesario.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <Badge variant="danger">Urgente</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────

