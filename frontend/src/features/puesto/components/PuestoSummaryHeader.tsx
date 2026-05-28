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
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Puesto de emergencia</p>
              <Badge variant={activo ? 'success' : 'danger'}>{activo ? 'Operativo' : 'Inactivo'}</Badge>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold text-slate-950 sm:text-2xl">{nombre}</h1>
            <p className="mt-0.5 truncate text-sm text-slate-500">{direccion}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className={`truncate text-2xl font-semibold leading-none ${stat.tone}`}>{stat.value}</p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-700">{stat.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{stat.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
