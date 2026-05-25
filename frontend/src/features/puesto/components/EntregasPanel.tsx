import Badge from '@/components/ui/Badge'

interface DonacionEntrega {
  id: string
  cantidad: number
  unidad: string
  estado: 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'
  comentario?: string | null
  eta?: string | null
  producto: { nombre: string }
  voluntario: {
    usuario: { nombre: string; apellidos: string; telefono?: string | null }
  }
}

function formatCantidad(cantidad: number) {
  return cantidad % 1 === 0 ? String(cantidad) : cantidad.toFixed(1)
}

function formatLlegadaEstimada(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const formatted = new Intl.DateTimeFormat('es-ES', {
    ...(isToday ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `Llegada estimada: ${formatted}`
}

function EstadoDonacionBadge({ estado }: { estado: DonacionEntrega['estado'] }) {
  if (estado === 'EN_CAMINO') return <Badge variant="info">En camino</Badge>
  if (estado === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  if (estado === 'ENTREGADA') return <Badge variant="success">Entregada</Badge>
  return <Badge variant="danger">Cancelada</Badge>
}

interface EntregasPanelProps {
  donaciones: DonacionEntrega[]
  loading: boolean
  visible: boolean
  onToggle: () => void
}

export default function EntregasPanel({ donaciones, loading, visible, onToggle }: EntregasPanelProps) {
  const proximaEntrega = donaciones
    .map((donacion) => ({ donacion, llegada: donacion.eta ? new Date(donacion.eta).getTime() : Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.llegada - b.llegada)[0]?.donacion

  return (
    <section className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-950">Entregas en camino</h2>
          <p className="text-xs text-gray-500">
            {donaciones.length === 0
              ? 'Sin entregas activas.'
              : `${donaciones.length} activas${proximaEntrega ? ` - próxima: ${proximaEntrega.producto.nombre}` : ''}`}
          </p>
        </div>
        <button type="button" onClick={onToggle} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {visible ? 'Ocultar' : 'Ver entregas'} ({donaciones.length})
        </button>
      </div>

      {visible && loading ? (
        <div className="flex justify-center rounded-lg border border-slate-200 bg-slate-50 py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-amber-600" />
        </div>
      ) : visible && donaciones.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
          No hay entregas pendientes o en camino ahora mismo.
        </p>
      ) : visible ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {donaciones.slice(0, 6).map((donacion) => {
            const voluntario = donacion.voluntario.usuario
            const llegada = formatLlegadaEstimada(donacion.eta)

            return (
              <article key={donacion.id} className="w-72 flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">
                      {formatCantidad(donacion.cantidad)} {donacion.unidad} de {donacion.producto.nombre}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-600">{voluntario.nombre} {voluntario.apellidos}</p>
                    {voluntario.telefono && <p className="text-xs text-slate-500">Telefono: {voluntario.telefono}</p>}
                  </div>
                  <EstadoDonacionBadge estado={donacion.estado} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {llegada && <span className="rounded-full bg-white px-2 py-1">{llegada}</span>}
                  {donacion.comentario && <span className="rounded-full bg-white px-2 py-1">{donacion.comentario}</span>}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
