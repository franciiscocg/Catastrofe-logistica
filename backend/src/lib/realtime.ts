import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'

type RealtimeEvent =
  | 'incidencia:created'
  | 'incidencia:updated'
  | 'inventario:updated'
  | 'stock:critical'
  | 'donacion:created'
  | 'donacion:updated'
  | 'solicitud-puesto:updated'
  | 'solicitud-participacion:updated'
  | 'puesto:updated'

let io: Server | null = null

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    socket.emit('realtime:ready', { connectedAt: new Date().toISOString() })
  })

  return io
}

export function emitRealtime(event: RealtimeEvent, payload: Record<string, unknown>) {
  io?.emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  })
}

export function emitInventoryEvents(puestoId: string, item?: { id?: string; tipo?: string; cantidad?: number; producto?: unknown } | null) {
  emitRealtime('inventario:updated', { puestoId, item })
  if (item?.tipo === 'NECESARIO' && typeof item.cantidad === 'number' && item.cantidad > 0) {
    emitRealtime('stock:critical', { puestoId, item })
  }
}
