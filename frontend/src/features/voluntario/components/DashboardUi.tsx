import type { ReactNode } from 'react'

export type AccionVoluntario = 'donacion' | 'incidencia' | 'puesto'

export const actionMeta: Record<AccionVoluntario, {
  title: string
  mark: string
  classes: { wrapper: string; mark: string; line: string }
}> = {
  donacion: {
    title: 'Hacer una donacion',
    mark: 'D',
    classes: {
      wrapper: 'border-cyan-200 bg-white hover:border-cyan-400 hover:shadow-cyan-950/10',
      mark: 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200',
      line: 'bg-cyan-500',
    },
  },
  incidencia: {
    title: 'Ayudar en incidencia',
    mark: '!',
    classes: {
      wrapper: 'border-amber-200 bg-white hover:border-amber-400 hover:shadow-amber-950/10',
      mark: 'bg-amber-500 text-white',
      line: 'bg-amber-500',
    },
  },
  puesto: {
    title: 'Ayudar en puesto',
    mark: 'P',
    classes: {
      wrapper: 'border-indigo-200 bg-white hover:border-indigo-400 hover:shadow-indigo-950/10',
      mark: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
      line: 'bg-indigo-500',
    },
  },
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  )
}

export function ActionCard({
  type,
  title,
  subtitle,
  onClick,
}: {
  type?: AccionVoluntario
  title?: string
  icon?: string
  subtitle: string
  onClick: () => void
}) {
  const inferredType: AccionVoluntario = type ?? (
    title?.includes('incidencia') ? 'incidencia' : title?.includes('puesto') ? 'puesto' : 'donacion'
  )
  const meta = actionMeta[inferredType]

  return (
    <button
      onClick={onClick}
      className={`group relative min-h-44 overflow-hidden rounded-lg border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${meta.classes.wrapper}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${meta.classes.line}`} />
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold shadow-sm ${meta.classes.mark}`}>
        {meta.mark}
      </span>
      <p className="mt-5 text-base font-semibold text-slate-950">{meta.title}</p>
      <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>
      <span className="mt-5 inline-flex items-center text-sm font-semibold text-slate-700 transition-colors group-hover:text-slate-950">
        Abrir <span className="ml-2 transition-transform group-hover:translate-x-1">-&gt;</span>
      </span>
    </button>
  )
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  children: ReactNode
}) {
  const classes = {
    info: 'border-cyan-200 bg-cyan-50 text-cyan-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
  }

  return <div className={`rounded-lg border px-4 py-3 text-sm shadow-sm ${classes[tone]}`}>{children}</div>
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      {subtitle && <p className="max-w-xl text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

export function RouteSafetyPanel({
  distanciaKm,
  duracionMin,
  incidenciasEvitadas,
  incidenciasCercanas,
  destino,
}: {
  distanciaKm: number
  duracionMin: number
  incidenciasEvitadas: number
  incidenciasCercanas: number
  destino: string
}) {
  const riesgo = incidenciasCercanas > 0 || incidenciasEvitadas > 0

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-slate-50 px-2 py-2">
          <p className="font-medium text-slate-500">Distancia</p>
          <p className="mt-1 font-semibold text-slate-800">{distanciaKm.toFixed(1)} km</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-2">
          <p className="font-medium text-slate-500">Tiempo</p>
          <p className="mt-1 font-semibold text-slate-800">~{duracionMin} min</p>
        </div>
        <div className={`rounded-md px-2 py-2 ${riesgo ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <p className={`font-medium ${riesgo ? 'text-amber-700' : 'text-emerald-700'}`}>Seguridad</p>
          <p className={`mt-1 font-semibold ${riesgo ? 'text-amber-900' : 'text-emerald-900'}`}>
            {riesgo ? `${incidenciasCercanas} aviso${incidenciasCercanas === 1 ? '' : 's'} cerca` : 'Ruta sin avisos'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Destino: {destino}. Si la ruta cambia o detectas peligro, avisa al puesto al llegar.
      </p>
    </div>
  )
}
