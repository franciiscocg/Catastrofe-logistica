import Button from '@/components/ui/Button'
import type { IncidenciaMarker } from '@/components/shared/Map'

type EstadoVia = 'CORTADA' | 'TRANSITABLE'

export function HistorialComentariosSheet({
  incidencia,
  onClose,
}: {
  incidencia: IncidenciaMarker
  onClose: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[2100] flex max-h-[72vh] flex-col rounded-t-2xl bg-white shadow-2xl">
      <div className="flex justify-center pb-1 pt-3">
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>

      <div className="flex items-start justify-between border-b border-gray-100 px-4 py-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Historial</p>
          <p className="font-semibold text-gray-900">Comentarios de la incidencia</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6 pt-3">
        {(incidencia.comentarios ?? []).length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
            Todavía no hay comentarios en esta incidencia.
          </p>
        ) : (
          incidencia.comentarios?.map((comentario) => (
            <article key={comentario.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  comentario.estado === 'CORTADA'
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-green-200 bg-green-50 text-green-700'
                }`}
                >
                  {comentario.estado === 'CORTADA' ? 'Sigue cortada' : 'Resuelta'}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(comentario.createdAt).toLocaleString('es-ES')}
                </span>
              </div>
              <p className="text-sm text-gray-800">{comentario.comentario}</p>
              {comentario.autor && (
                <p className="mt-2 text-xs text-gray-500">
                  {comentario.autor.nombre} {comentario.autor.apellidos}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  )
}

export function ActualizarIncidenciaSheet({
  estado,
  texto,
  error,
  loading,
  onEstadoChange,
  onTextoChange,
  onSubmit,
  onClose,
}: {
  estado: EstadoVia
  texto: string
  error: string | null
  loading: boolean
  onEstadoChange: (estado: EstadoVia) => void
  onTextoChange: (texto: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[2100] flex max-h-[70vh] flex-col rounded-t-2xl bg-white shadow-2xl">
      <div className="flex justify-center pb-1 pt-3">
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>

      <div className="flex items-start justify-between border-b border-gray-100 px-4 py-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Actualizar incidencia</p>
          <p className="font-semibold text-gray-900">Comentario o resolución</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Actualización</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onEstadoChange('CORTADA')}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                estado === 'CORTADA'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide">Sigue cortada</p>
              <p className="mt-1 text-xs">La incidencia continúa</p>
            </button>
            <button
              type="button"
              onClick={() => onEstadoChange('TRANSITABLE')}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                estado === 'TRANSITABLE'
                  ? 'border-green-300 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide">Resuelta</p>
              <p className="mt-1 text-xs">La calle ya es transitable</p>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Comentario</label>
          <textarea
            rows={3}
            value={texto}
            onChange={(e) => onTextoChange(e.target.value)}
            className="w-full rounded-lg border-gray-300 bg-white text-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Ejemplo: Han retirado los escombros y ya pasan coches"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <Button fullWidth loading={loading} onClick={onSubmit} className="h-11">
          Guardar actualización
        </Button>
      </div>
    </div>
  )
}
