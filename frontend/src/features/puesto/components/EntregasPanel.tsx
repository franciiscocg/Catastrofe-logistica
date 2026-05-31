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
  if (!value) return 'Sin hora'
  const date = new Date(value)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat('es-ES', {
    ...(isToday ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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
  const entregasOrdenadas = [...donaciones].sort((a, b) => {
    const aEta = a.eta ? new Date(a.eta).getTime() : Number.POSITIVE_INFINITY
    const bEta = b.eta ? new Date(b.eta).getTime() : Number.POSITIVE_INFINITY
    return aEta - bEta
  })

  const proximaEntrega = entregasOrdenadas[0]

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recepcion</p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-950">Entregas activas</h2>
          <p className="mt-1 truncate text-xs text-slate-500">
            {donaciones.length === 0
              ? 'Sin entradas pendientes'
              : `${donaciones.length} en seguimiento${proximaEntrega ? `, proxima: ${proximaEntrega.producto.nombre}` : ''}`}
          </p>
        </div>
        <Badge variant={donaciones.length ? 'info' : 'default'}>{visible ? 'Ocultar' : donaciones.length}</Badge>
      </button>

      {visible && loading ? (
        <div className="border-t border-slate-100 px-4 py-6">
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : visible && donaciones.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-5 text-sm text-slate-500">
          No hay entregas pendientes o en camino ahora mismo.
        </p>
      ) : visible ? (
        <div className="max-h-80 space-y-2 overflow-y-auto border-t border-slate-100 p-3">
          {entregasOrdenadas.slice(0, 6).map((donacion) => {
            const voluntario = donacion.voluntario.usuario

            return (
              <article key={donacion.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {formatCantidad(donacion.cantidad)} {donacion.unidad} de {donacion.producto.nombre}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">
                      {voluntario.nombre} {voluntario.apellidos}
                    </p>
                  </div>
                  <EstadoDonacionBadge estado={donacion.estado} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  <span className="rounded-md bg-white px-2 py-1">ETA {formatLlegadaEstimada(donacion.eta)}</span>
                  {voluntario.telefono && <span className="rounded-md bg-white px-2 py-1">{voluntario.telefono}</span>}
                  {donacion.comentario && <span className="rounded-md bg-white px-2 py-1">{donacion.comentario}</span>}
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
