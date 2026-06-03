import { ChevronRight, Map, MapPin, Search } from 'lucide-react'

interface CiudadanoInicioProps {
  onVerMapa: () => void
  onBuscarProducto: () => void
  onReportarIncidencia: () => void
}

export default function CiudadanoInicio({
  onVerMapa,
  onBuscarProducto,
  onReportarIncidencia,
}: CiudadanoInicioProps) {
  const acciones = [
    {
      title: 'Ver mapa',
      description: 'Consulta puestos de emergencia, incidencias y rutas seguras cercanas.',
      Icon: Map,
      action: onVerMapa,
      tone: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    {
      title: 'Buscar producto',
      description: 'Encuentra agua, comida, mantas u otros recursos disponibles por puesto.',
      Icon: Search,
      action: onBuscarProducto,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      title: 'Reportar incidencia',
      description: 'Marca una calle cortada o un problema para avisar al resto de ciudadanos.',
      Icon: MapPin,
      action: onReportarIncidencia,
      tone: 'border-red-200 bg-red-50 text-red-700',
    },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Acceso ciudadano</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">¿Qué necesitas hacer?</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Elige una acción para consultar ayuda cercana, buscar productos o avisar de una incidencia.
          </p>
        </div>

        <div className="space-y-3">
          {acciones.map((accion) => {
            const Icon = accion.Icon
            return (
              <button
                key={accion.title}
                type="button"
                onClick={accion.action}
                className="group w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border ${accion.tone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">{accion.title}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-gray-500">{accion.description}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" aria-hidden="true" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
