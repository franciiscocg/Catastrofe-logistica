import { useState, useEffect } from 'react'
import { useSyncStore } from '@/store/sync.store'

export type ConnectivityMode = 'online' | 'slow' | 'offline'

type NetworkInformation = EventTarget & {
  effectiveType?: string
}

export function useConnectivity() {
  const [mode, setMode] = useState<ConnectivityMode>(
    navigator.onLine ? 'online' : 'offline',
  )
  const flush = useSyncStore((s) => s.flush)
  const loadPendingCount = useSyncStore((s) => s.loadPendingCount)

  useEffect(() => {
    const handleOnline = () => {
      setMode('online')
      flush()
    }
    const handleOffline = () => setMode('offline')

    loadPendingCount()
    if (navigator.onLine) flush()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const retryInterval = window.setInterval(() => {
      if (navigator.onLine) flush()
    }, 15000)

    // Detectar conexión lenta vía Network Information API (Chrome/Android)
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
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
        window.clearInterval(retryInterval)
        connection.removeEventListener('change', checkSpeed)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.clearInterval(retryInterval)
    }
  }, [flush, loadPendingCount])

  return { mode, isOnline: mode !== 'offline', isSlow: mode === 'slow' }
}
