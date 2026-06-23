import { useState } from 'react'
import { useConnectivity } from '@/hooks/useConnectivity'
import { useSyncStore } from '@/store/sync.store'
import { translateErrorMessage } from '@/utils/errors'

export default function ConnectivityBanner() {
  const [expanded, setExpanded] = useState(false)
  const { mode } = useConnectivity()
  const {
    pendingCount,
    conflictCount,
    errorCount,
    blockedOperations,
    isSyncing,
    retryOperation,
    discardOperation,
  } = useSyncStore()
  const hasBlockedItems = conflictCount > 0 || errorCount > 0

  if (mode === 'online' && pendingCount === 0 && !hasBlockedItems) return null

  return (
    <div className="relative z-[3000]">
      <button
        type="button"
        onClick={() => hasBlockedItems && setExpanded((current) => !current)}
        className={`w-full px-4 py-2 text-center text-sm font-medium ${
          hasBlockedItems
            ? 'bg-rose-700 text-white'
            : mode === 'offline'
              ? 'bg-red-600 text-white'
              : mode === 'slow'
                ? 'bg-amber-500 text-white'
                : 'bg-blue-600 text-white'
        }`}
      >
        {hasBlockedItems && (
          `${conflictCount} conflicto${conflictCount !== 1 ? 's' : ''} y ${errorCount} error${errorCount !== 1 ? 'es' : ''} de sincronización requieren revisión`
        )}
        {!hasBlockedItems && mode === 'offline' && 'Sin conexión - mostrando la última información guardada; algunos cambios se sincronizarán al volver'}
        {!hasBlockedItems && mode === 'slow' && 'Conexión lenta - descarga de imágenes desactivada'}
        {!hasBlockedItems && mode === 'online' && pendingCount > 0 && (
          isSyncing
            ? `Sincronizando ${pendingCount} cambio${pendingCount > 1 ? 's' : ''}...`
            : `${pendingCount} cambio${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de sincronizar`
        )}
      </button>

      {expanded && hasBlockedItems && (
        <div className="absolute inset-x-0 top-full border-b border-rose-200 bg-white px-4 py-3 text-left shadow-lg">
          <div className="mx-auto max-w-4xl space-y-2">
            {blockedOperations.map((op) => (
              <div key={op.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rose-950">
                    {op.method} {op.url}
                  </p>
                  <p className="truncate text-xs text-rose-700">
                    {translateErrorMessage(op.error, 'No se pudo sincronizar la operación.')}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => retryOperation(op.id)}
                    className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
                  >
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => discardOperation(op.id)}
                    className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
