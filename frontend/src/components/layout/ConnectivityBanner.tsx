import { useConnectivity } from '@/hooks/useConnectivity'
import { useSyncStore } from '@/store/sync.store'

export default function ConnectivityBanner() {
  const { mode } = useConnectivity()
  const { pendingCount, isSyncing } = useSyncStore()

  if (mode === 'online' && pendingCount === 0) return null

  return (
    <div
      className={`px-4 py-2 text-sm text-center font-medium ${
        mode === 'offline'
          ? 'bg-red-600 text-white'
          : mode === 'slow'
            ? 'bg-amber-500 text-white'
            : 'bg-blue-600 text-white'
      }`}
    >
      {mode === 'offline' && '📵 Sin conexión — trabajando en modo offline'}
      {mode === 'slow' && '🐢 Conexión lenta — descarga de imágenes desactivada'}
      {mode === 'online' && pendingCount > 0 && (
        isSyncing
          ? `🔄 Sincronizando ${pendingCount} cambio${pendingCount > 1 ? 's' : ''}...`
          : `⏳ ${pendingCount} cambio${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de sincronizar`
      )}
    </div>
  )
}
