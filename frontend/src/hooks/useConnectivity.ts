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
    const updateModeFromNavigator = () => {
      setMode(navigator.onLine ? 'online' : 'offline')
    }
    const handleNetworkStatus = (event: Event) => {
      const status = (event as CustomEvent<ConnectivityMode>).detail
      if (status === 'offline') setMode('offline')
      if (status === 'online' && navigator.onLine) setMode('online')
    }
    const handleOnline = () => {
      setMode('online')
      flush()
    }
    const handleOffline = () => setMode('offline')

    updateModeFromNavigator()
    loadPendingCount()
    if (navigator.onLine) flush()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', updateModeFromNavigator)
    window.addEventListener('pageshow', updateModeFromNavigator)
    window.addEventListener('catlogistica:network-status', handleNetworkStatus)
    document.addEventListener('visibilitychange', updateModeFromNavigator)
    const retryInterval = window.setInterval(() => {
      updateModeFromNavigator()
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
        window.removeEventListener('focus', updateModeFromNavigator)
        window.removeEventListener('pageshow', updateModeFromNavigator)
        window.removeEventListener('catlogistica:network-status', handleNetworkStatus)
        document.removeEventListener('visibilitychange', updateModeFromNavigator)
        window.clearInterval(retryInterval)
        connection.removeEventListener('change', checkSpeed)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', updateModeFromNavigator)
      window.removeEventListener('pageshow', updateModeFromNavigator)
      window.removeEventListener('catlogistica:network-status', handleNetworkStatus)
      document.removeEventListener('visibilitychange', updateModeFromNavigator)
      window.clearInterval(retryInterval)
    }
  }, [flush, loadPendingCount])

  return { mode, isOnline: mode !== 'offline', isSlow: mode === 'slow' }
}
