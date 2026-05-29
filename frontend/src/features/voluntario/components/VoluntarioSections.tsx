import Button from '@/components/ui/Button'
import { ActionCard, SectionHeader, actionMeta, type AccionVoluntario } from './DashboardUi'

export function ActividadElegidaHeader({
  accion,
  actividadBloqueada,
  onVolver,
}: {
  accion: AccionVoluntario
  actividadBloqueada: boolean
  onVolver: () => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-400">Actividad elegida</p>
        <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
          {actionMeta[accion].title}
        </h2>
      </div>
      {!actividadBloqueada && (
        <Button type="button" variant="secondary" size="sm" onClick={onVolver}>
          Volver
        </Button>
      )}
    </div>
  )
}

export function SelectorAccionVoluntario({
  onSeleccionar,
}: {
  onSeleccionar: (accion: AccionVoluntario) => void
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title="¿Qué quieres hacer ahora?"
        subtitle="Elige una línea de trabajo. Cuando inicies una actividad, el resto quedará bloqueado hasta que la termines."
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          type="donacion"
          subtitle="Compromete material necesario y confirma la entrega en el puesto."
          onClick={() => onSeleccionar('donacion')}
        />
        <ActionCard
          type="incidencia"
          subtitle="Apúntate a un aviso abierto y mantente asignado hasta cerrarlo."
          onClick={() => onSeleccionar('incidencia')}
        />
        <ActionCard
          type="puesto"
          subtitle="Incorpórate como apoyo operativo en un punto de asistencia."
          onClick={() => onSeleccionar('puesto')}
        />
      </div>
    </section>
  )
}
