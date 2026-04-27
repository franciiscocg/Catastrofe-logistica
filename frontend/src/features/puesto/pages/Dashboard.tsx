import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const INVENTARIO_EJEMPLO = [
  { id: '1', nombre: 'Agua embotellada', cantidad: 120, unidad: 'litros', nivel: 'alto' as const },
  { id: '2', nombre: 'Alimentos no perecederos', cantidad: 45, unidad: 'kg', nivel: 'medio' as const },
  { id: '3', nombre: 'Ropa de abrigo', cantidad: 8, unidad: 'prendas', nivel: 'bajo' as const },
  { id: '4', nombre: 'Medicamentos básicos', cantidad: 2, unidad: 'kits', nivel: 'critico' as const },
]

const nivelVariant = {
  alto: 'success' as const,
  medio: 'info' as const,
  bajo: 'warning' as const,
  critico: 'danger' as const,
}

const nivelLabel = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
  critico: 'Crítico',
}

export default function PuestoDashboard() {
  return (
    <div className="pb-6">

      {/* Info del puesto */}
      <div className="bg-amber-500 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Puesto activo</p>
        <p className="font-semibold">CEIP La Paz</p>
        <p className="text-sm text-amber-100">C/ Mayor 12 · 4 voluntarios hoy</p>
      </div>

      {/* Resumen rápido */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-3">
        {[
          { label: 'Productos', value: '12', sub: 'disponibles' },
          { label: 'Necesidades', value: '3', sub: 'urgentes' },
          { label: 'Entregas hoy', value: '7', sub: 'verificadas' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-xs text-gray-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Inventario */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Inventario</h2>
          <Button size="sm" variant="secondary">+ Añadir</Button>
        </div>
        <div className="space-y-2">
          {INVENTARIO_EJEMPLO.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                <p className="text-xs text-gray-500">{item.cantidad} {item.unidad}</p>
              </div>
              <Badge variant={nivelVariant[item.nivel]}>{nivelLabel[item.nivel]}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="px-4 pt-4 space-y-2">
        <Button variant="secondary" fullWidth>📷 Verificar entrega (QR)</Button>
        <Button variant="secondary" fullWidth>👷 Gestionar voluntarios</Button>
      </div>
    </div>
  )
}
