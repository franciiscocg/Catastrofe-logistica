import Badge from '@/components/ui/Badge'

interface SummaryStat {
  label: string
  value: string | number
  helper: string
  tone: string
}

interface PuestoSummaryHeaderProps {
  nombre: string
  direccion: string
  activo: boolean
  stats: SummaryStat[]
}

export default function PuestoSummaryHeader({ nombre, direccion, activo, stats }: PuestoSummaryHeaderProps) {
  return (
    <section className="flex-shrink-0 border-b border-slate-200 bg-white">
      <div className="px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-amber-700">Panel operativo</p>
            <Badge variant={activo ? 'success' : 'danger'}>{activo ? 'Activo' : 'Inactivo'}</Badge>
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-gray-950 sm:text-xl">{nombre}</h1>
          <p className="truncate text-sm text-gray-500">{direccion}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <p className={`truncate text-lg font-semibold leading-none ${stat.tone}`}>{stat.value}</p>
              <p className="truncate text-xs font-medium text-slate-600">{stat.label}</p>
              <p className="hidden truncate text-xs text-slate-400 xl:block">{stat.helper}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
