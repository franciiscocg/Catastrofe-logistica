import { useState, useEffect } from 'react'
import { useSyncStore } from '@/store/sync.store'

export type ConnectivityMode = 'online' | 'slow' | 'offline'

export function useConnectivity() {
  const [mode, setMode] = useState<ConnectivityMode>(
    navigator.onLine ? 'online' : 'offline',
  )
  const flush = useSyncStore((s) => s.flush)

  useEffect(() => {
    const handleOnline = () => {
      setMode('online')
      flush()
    }
    const handleOffline = () => setMode('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Detectar conexión lenta vía Network Information API (Chrome/Android)
    const connection = (navigator as Navigator & { connection?: { effectiveType: string } }).connection
    if (connection) {
      const checkSpeed = () => {
        if (!navigator.onLine) return
        setMode(connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g' ? 'slow' : 'online')
      }
      connection.addEventListener('change', checkSpeed)
      checkSpeed()
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        connection.removeEventListener('change', checkSpeed)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flush])

  return { mode, isOnline: mode !== 'offline', isSlow: mode === 'slow' }
}
