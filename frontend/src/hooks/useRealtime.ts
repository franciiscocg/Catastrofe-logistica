import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'

const API_URL = import.meta.env.VITE_API_URL ?? window.location.origin
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '')

function invalidateMatching(queryClient: ReturnType<typeof useQueryClient>, prefixes: string[]) {
  prefixes.forEach((prefix) => {
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.some((key) => typeof key === 'string' && key.startsWith(prefix)),
    })
  })
}

function notifyLocalState(event: string, payload: unknown) {
  window.dispatchEvent(new CustomEvent('realtime:update', { detail: { event, payload } }))
}

export function useRealtime() {
  const queryClient = useQueryClient()
  const token = useAuthStore((state) => state.accessToken)

  useEffect(() => {
    if (!token) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      withCredentials: true,
    })

    socket.on('incidencia:created', (payload) => {
      notifyLocalState('incidencia:created', payload)
      invalidateMatching(queryClient, ['incidencias'])
    })

    socket.on('incidencia:updated', (payload) => {
      notifyLocalState('incidencia:updated', payload)
      invalidateMatching(queryClient, ['incidencias', 'mis-asignaciones-incidencia'])
    })

    socket.on('inventario:updated', (payload) => {
      notifyLocalState('inventario:updated', payload)
      invalidateMatching(queryClient, ['inventario', 'inventario-historial', 'inventario-ciudadano', 'necesidades-donacion', 'puestos', 'puesto-detalle'])
    })

    socket.on('stock:critical', (payload) => {
      notifyLocalState('stock:critical', payload)
      invalidateMatching(queryClient, ['inventario', 'inventario-ciudadano', 'necesidades-donacion', 'puestos', 'puesto-detalle'])
    })

    socket.on('donacion:created', (payload) => {
      notifyLocalState('donacion:created', payload)
      invalidateMatching(queryClient, ['mis-donaciones', 'donaciones', 'donaciones-puesto', 'necesidades-donacion', 'inventario', 'puesto-detalle'])
    })

    socket.on('donacion:updated', (payload) => {
      notifyLocalState('donacion:updated', payload)
      invalidateMatching(queryClient, ['mis-donaciones', 'donaciones', 'donaciones-puesto', 'necesidades-donacion', 'inventario', 'puesto-detalle'])
    })

    socket.on('solicitud-puesto:updated', (payload) => {
      notifyLocalState('solicitud-puesto:updated', payload)
      invalidateMatching(queryClient, ['solicitudes-puesto', 'mi-solicitud-puesto', 'puestos'])
    })

    socket.on('solicitud-participacion:updated', (payload) => {
      notifyLocalState('solicitud-participacion:updated', payload)
      invalidateMatching(queryClient, ['solicitudes-participacion', 'mis-solicitudes-participacion', 'participantes-puesto', 'puestos', 'puesto-detalle'])
    })

    socket.on('puesto:updated', (payload) => {
      notifyLocalState('puesto:updated', payload)
      invalidateMatching(queryClient, ['puestos', 'puesto-detalle', 'participantes-puesto', 'mis-asignaciones-puesto'])
    })

    return () => {
      socket.disconnect()
    }
  }, [queryClient, token])
}

export function RealtimeBridge() {
  useRealtime()
  return null
}
