import Map from '@/components/shared/Map'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

// Datos de ejemplo para el scaffold inicial
const PUESTOS_EJEMPLO = [
  { id: '1', nombre: 'CEIP La Paz', direccion: 'C/ Mayor 12, Valencia', distanciaKm: 0.4, necesidades: 3 },
  { id: '2', nombre: 'Pabellón Municipal Norte', direccion: 'Av. del Deporte 5', distanciaKm: 1.2, necesidades: 1 },
  { id: '3', nombre: 'Centro Cívico Sur', direccion: 'Plaza de la Constitución 2', distanciaKm: 2.1, necesidades: 0 },
]

export default function CiudadanoDashboard() {
  return (
    <div className="pb-6">

      {/* Banner de catástrofe activa */}
      <div className="bg-red-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Catástrofe activa</p>
        <p className="font-semibold">DANA Valencia — Fase: Limpieza</p>
      </div>

      {/* Mapa */}
      <div className="px-4 pt-4">
        <Map className="h-48 w-full" />
      </div>

      {/* Acciones rápidas */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="sm" fullWidth>
          📍 Reportar calle
        </Button>
        <Button variant="secondary" size="sm" fullWidth>
          🔍 Buscar producto
        </Button>
      </div>

      {/* Lista de puestos cercanos */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Puestos cercanos</h2>
        <div className="space-y-2">
          {PUESTOS_EJEMPLO.map((puesto) => (
            <button
              key={puesto.id}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{puesto.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{puesto.direccion}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-400">{puesto.distanciaKm} km</span>
                  {puesto.necesidades > 0 && (
                    <Badge variant="warning">{puesto.necesidades} necesidades</Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
