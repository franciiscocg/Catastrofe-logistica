import { type ModoTransporte } from '@/utils/routing'
import { calcularBearing, distanciaAlStep, formatearDistanciaNav, ROTACION_ICONO, type DireccionIcono, type StepNavegacion } from '@/utils/navegacion'

function FlechaNavegacion({
  icono,
  rotacion,
  grande = false,
}: {
  icono: DireccionIcono
  rotacion: number
  grande?: boolean
}) {
  const size = grande ? 80 : 56
  if (icono === 'destino') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
        <circle cx="40" cy="40" r="28" fill="#16a34a" />
        <text x="40" y="47" textAnchor="middle" fontSize="24" fill="white">★</text>
      </svg>
    )
  }
  if (icono === 'rotonda') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
        <circle cx="40" cy="40" r="28" stroke="#2563EB" strokeWidth="6" fill="none" />
        <path d="M54 30 L62 38 L54 46" stroke="#2563EB" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  return (
    <div style={{ transform: `rotate(${rotacion}deg)`, transition: 'transform 0.3s ease' }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
        <path d="M40 8 L58 62 L40 50 L22 62 Z" fill="#2563EB" />
      </svg>
    </div>
  )
}

export default function PanelNavegacionActiva({
  steps,
  stepIdx,
  userPosition,
  headingDispositivo,
  modo,
  vozActiva,
  onToggleVoz,
  onAvanzar,
  onRetroceder,
  onFinalizar,
}: {
  steps: StepNavegacion[]
  stepIdx: number
  userPosition: [number, number] | null
  headingDispositivo: number | null
  modo: ModoTransporte
  vozActiva: boolean
  onToggleVoz: () => void
  onAvanzar: () => void
  onRetroceder: () => void
  onFinalizar: () => void
}) {
  const step     = steps[stepIdx]
  const nextStep = steps[stepIdx + 1]
  if (!step) return null

  const esUltimo = stepIdx === steps.length - 1

  const distanciaM = userPosition
    ? Math.round(distanciaAlStep(userPosition[0], userPosition[1], step))
    : null

  const bearingAbsoluto = userPosition && !esUltimo
    ? calcularBearing(userPosition[0], userPosition[1], step.lat, step.lng)
    : null

  const brujulaDisponible = headingDispositivo !== null && bearingAbsoluto !== null
  const rotacion = brujulaDisponible
    ? (bearingAbsoluto! - headingDispositivo! + 360) % 360
    : ROTACION_ICONO[step.icono]

  return (
    <div className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-200">
      {/* Drag handle */}
      <div className="flex justify-center pt-2.5 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header: step counter + modo + voz + finalizar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">
            {stepIdx + 1}/{steps.length}
          </span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500">{modo === 'foot' ? '🚶 A pie' : '🚗 En coche'}</span>
          {brujulaDisponible && (
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-1.5 py-0.5">🧭</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleVoz}
            className={`rounded-full p-1.5 text-base transition-colors ${vozActiva ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
            aria-label={vozActiva ? 'Silenciar voz' : 'Activar voz'}
          >
            {vozActiva ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            onClick={onFinalizar}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
          >
            Finalizar
          </button>
        </div>
      </div>

      {/* Main row: compass arrow + instruction + distance */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Direction indicator */}
        <div className={`flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-xl border-2 shadow-sm ${brujulaDisponible ? 'bg-slate-100 border-blue-200' : 'bg-blue-50 border-blue-200'}`}>
          {brujulaDisponible ? (
            <div className="relative flex items-center justify-center w-full h-full">
              <span className="absolute top-1 text-[9px] font-bold text-slate-400">N</span>
              <span className="absolute bottom-1 text-[9px] font-bold text-slate-400">S</span>
              <span className="absolute left-1 text-[9px] font-bold text-slate-400">O</span>
              <span className="absolute right-1 text-[9px] font-bold text-slate-400">E</span>
              <FlechaNavegacion icono={step.icono} rotacion={rotacion} />
            </div>
          ) : (
            <FlechaNavegacion icono={step.icono} rotacion={rotacion} />
          )}
        </div>

        {/* Instruction text + distance */}
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-gray-900 leading-tight">{step.instruccion}</p>
          {step.calle && step.tipo !== 'depart' && step.tipo !== 'arrive' && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{step.calle}</p>
          )}
          {distanciaM !== null && !esUltimo && (
            <p className="text-2xl font-extrabold text-blue-700 mt-1 tabular-nums leading-none">
              {formatearDistanciaNav(distanciaM)}
            </p>
          )}
        </div>
      </div>

      {/* Next step */}
      {nextStep && (
        <div className="mx-4 mb-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">A continuación</span>
          <span className="text-sm text-gray-600 flex-1 truncate">{nextStep.instruccion}</span>
        </div>
      )}

      {/* Step controls */}
      <div className="flex gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={onRetroceder}
          disabled={stepIdx === 0}
          className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          ← Anterior
        </button>
        <button
          type="button"
          onClick={onAvanzar}
          disabled={esUltimo}
          className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

