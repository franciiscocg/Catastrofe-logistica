import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { prisma } from './prisma.js'

type RealtimeRole = 'CIUDADANO' | 'VOLUNTARIO' | 'PUESTO_EMERGENCIA' | 'COORDINADOR'
type AuthenticatedUser = { sub?: string; id?: string; roles?: string[] }
type VerifyAccessToken = (token: string) => AuthenticatedUser | Promise<AuthenticatedUser>
type ResolvePuestoIds = (userId: string) => Promise<string[]>

type BroadcastRealtimePayloads = {
  'incidencia:created': { incidenciaId: string }
  'incidencia:updated': { incidenciaId: string }
  'inventario:updated': { puestoId: string; itemId?: string; deleted?: boolean }
  'stock:critical': { puestoId: string; itemId?: string }
  'donacion:created': { donacionId: string; puestoId: string }
  'donacion:updated': { donacionId: string; puestoId: string }
  'puesto:updated': { puestoId: string }
}

type RestrictedRealtimePayloads = {
  'solicitud-puesto:updated': { solicitudId: string; estado?: string }
  'solicitud-participacion:updated': { solicitudId?: string; puestoId: string; estado?: string }
}

const AUTHENTICATED_ROOM = 'authenticated'
const ROLES: RealtimeRole[] = ['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA', 'COORDINADOR']

let io: Server | null = null

function isRealtimeRole(role: string): role is RealtimeRole {
  return ROLES.includes(role as RealtimeRole)
}

async function findPuestoIdsForUser(userId: string) {
  const puestos = await prisma.puestoEmergencia.findMany({
    where: {
      OR: [
        { adminId: userId },
        { trabajadores: { some: { usuarioId: userId } } },
      ],
    },
    select: { id: true },
  })

  return puestos.map((puesto) => puesto.id)
}

export function realtimeRoleRoom(role: RealtimeRole) {
  return `role:${role}`
}

export function realtimeUserRoom(userId: string) {
  return `user:${userId}`
}

export function realtimePuestoRoom(puestoId: string) {
  return `puesto:${puestoId}`
}

export function initRealtime(
  server: HttpServer,
  verifyAccessToken: VerifyAccessToken,
  resolvePuestoIds: ResolvePuestoIds = findPuestoIdsForUser,
) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || !token) {
      next(new Error('No autenticado'))
      return
    }

    try {
      const user = await verifyAccessToken(token)
      const userId = user.sub ?? user.id
      if (!userId) throw new Error('Token sin usuario')

      const roles = (user.roles ?? []).filter(isRealtimeRole)
      const rooms = [
        AUTHENTICATED_ROOM,
        realtimeUserRoom(userId),
        ...roles.map(realtimeRoleRoom),
      ]

      if (roles.includes('PUESTO_EMERGENCIA')) {
        const puestoIds = await resolvePuestoIds(userId)
        rooms.push(...puestoIds.map(realtimePuestoRoom))
      }

      socket.data.realtimeRooms = rooms
      next()
    } catch {
      next(new Error('No autenticado'))
    }
  })

  io.on('connection', (socket) => {
    const rooms = socket.data.realtimeRooms as string[] | undefined
    rooms?.forEach((room) => socket.join(room))
    socket.emit('realtime:ready', { connectedAt: new Date().toISOString() })
  })

  return io
}

export function emitRealtime<Event extends keyof BroadcastRealtimePayloads>(
  event: Event,
  payload: BroadcastRealtimePayloads[Event],
) {
  io?.to(AUTHENTICATED_ROOM).emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  })
}

export function emitRestrictedRealtime<Event extends keyof RestrictedRealtimePayloads>(
  event: Event,
  payload: RestrictedRealtimePayloads[Event],
  rooms: string[],
) {
  if (rooms.length === 0) return

  io?.to([...new Set(rooms)]).emit(event, {
    ...payload,
    emittedAt: new Date().toISOString(),
  })
}

export function emitInventoryEvents(
  puestoId: string,
  item?: { id?: string; tipo?: string; cantidad?: number } | null,
) {
  emitRealtime('inventario:updated', { puestoId, itemId: item?.id })
  if (item?.tipo === 'NECESARIO' && typeof item.cantidad === 'number' && item.cantidad > 0) {
    emitRealtime('stock:critical', { puestoId, itemId: item.id })
  }
}
