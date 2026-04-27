import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Map from '@/components/shared/Map'

export default function CoordinadorDashboard() {
  return (
    <div className="pb-6">

      {/* Estado general */}
      <div className="bg-purple-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Panel de coordinación</p>
        <p className="font-semibold">DANA Valencia</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className="bg-purple-500 text-white">Fase: Limpieza</Badge>
          <span className="text-sm text-purple-200">Activa hace 3 días</span>
        </div>
      </div>

      {/* Métricas globales */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        {[
          { label: 'Puestos activos', value: '8', icon: '🏪' },
          { label: 'Voluntarios hoy', value: '142', icon: '🙋' },
          { label: 'Entregas realizadas', value: '89', icon: '📦' },
          { label: 'Alertas activas', value: '3', icon: '⚠️' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mapa general */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Vista general de la zona</h2>
        <Map className="h-48 w-full" />
      </div>

      {/* Alertas */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Alertas</h2>
        <div className="space-y-2">
          {[
            { texto: 'CEIP La Paz — medicamentos en nivel crítico', tipo: 'danger' as const },
            { texto: 'Zona Norte — 2 voluntarios sin asignación', tipo: 'warning' as const },
            { texto: 'Pabellón Sur — inventario actualizado', tipo: 'success' as const },
          ].map((alerta, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <Badge variant={alerta.tipo}>
                {alerta.tipo === 'danger' ? 'Crítico' : alerta.tipo === 'warning' ? 'Aviso' : 'Info'}
              </Badge>
              <p className="text-sm text-gray-700">{alerta.texto}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="px-4 pt-4 space-y-2">
        <Button variant="secondary" fullWidth>🏪 Gestionar puestos</Button>
        <Button variant="secondary" fullWidth>📢 Enviar alerta global</Button>
        <Button variant="secondary" fullWidth>⚙️ Configurar catástrofe</Button>
      </div>
    </div>
  )
}
