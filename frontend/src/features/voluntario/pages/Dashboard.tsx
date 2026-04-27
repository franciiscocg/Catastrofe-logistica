import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

type Modalidad = 'transporte' | 'laboral'

export default function VoluntarioDashboard() {
  return (
    <div className="pb-6">

      {/* Estado del voluntario */}
      <div className="bg-green-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Tu estado</p>
        <div className="flex items-center gap-2">
          <p className="font-semibold">Disponible</p>
          <Badge variant="success" className="bg-green-500 text-white">Activo</Badge>
        </div>
      </div>

      {/* Selección de modalidad */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Modalidad de voluntariado</h2>
        <div className="grid grid-cols-2 gap-3">
          <button className="bg-green-50 border-2 border-green-400 rounded-xl p-4 text-center">
            <p className="text-2xl mb-1">🚗</p>
            <p className="font-medium text-sm text-green-800">Transporte</p>
            <p className="text-xs text-green-600 mt-0.5">Lleva donaciones</p>
          </button>
          <button className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center hover:border-green-300 transition-colors">
            <p className="text-2xl mb-1">🔨</p>
            <p className="font-medium text-sm text-gray-700">Laboral</p>
            <p className="text-xs text-gray-500 mt-0.5">Trabajo físico</p>
          </button>
        </div>
      </div>

      {/* Próximo destino asignado */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Destino asignado</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">CEIP La Paz</p>
              <p className="text-sm text-gray-500 mt-0.5">C/ Mayor 12, Valencia</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="danger">Stock crítico</Badge>
                <span className="text-xs text-gray-400">0.4 km</span>
              </div>
            </div>
            <Button size="sm">Ir →</Button>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="px-4 pt-4 space-y-2">
        <Button variant="secondary" fullWidth>📦 Declarar productos a entregar</Button>
        <Button variant="secondary" fullWidth>📷 Escanear QR de recepción</Button>
      </div>
    </div>
  )
}
