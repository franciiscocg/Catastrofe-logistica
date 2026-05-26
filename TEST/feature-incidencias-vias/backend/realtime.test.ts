// @vitest-environment node
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { io as createClient, type Socket } from '../../../frontend/node_modules/socket.io-client/build/esm-debug/index.js'
import {
  emitRealtime,
  emitRestrictedRealtime,
  initRealtime,
  realtimeRoleRoom,
  realtimeUserRoom,
} from '../../../backend/src/lib/realtime.js'

type TokenUser = { id: string; roles: string[] }

const users: Record<string, TokenUser> = {
  coordinador: { id: 'coord-1', roles: ['COORDINADOR'] },
  solicitante: { id: 'user-1', roles: ['CIUDADANO'] },
  ajeno: { id: 'user-2', roles: ['CIUDADANO'] },
}

let server: HttpServer | undefined
let realtime: ReturnType<typeof initRealtime> | undefined
let sockets: Socket[] = []

async function startRealtime() {
  server = createServer()
  realtime = initRealtime(server, async (token) => {
    const user = users[token]
    if (!user) throw new Error('Token invalido')
    return user
  }, async () => [])

  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

function client(url: string, token?: string) {
  const socket = createClient(url, {
    auth: token ? { token } : undefined,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  })
  sockets.push(socket)
  return socket
}

function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', reject)
  })
}

function waitForEvent(socket: Socket, event: string) {
  return new Promise<Record<string, unknown>>((resolve) => {
    socket.once(event, resolve)
  })
}

function waitForSilence(socket: Socket, event: string) {
  return new Promise<boolean>((resolve) => {
    let received = false
    socket.once(event, () => {
      received = true
    })
    setTimeout(() => resolve(received), 40)
  })
}

afterEach(async () => {
  sockets.forEach((socket) => socket.disconnect())
  sockets = []
  realtime?.close()
  realtime = undefined
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()))
  }
  server = undefined
})

describe('realtime autorizado', () => {
  it('rechaza una conexion sin token de acceso', async () => {
    const url = await startRealtime()
    const socket = client(url)

    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve))

    expect(error.message).toBe('No autenticado')
    expect(socket.connected).toBe(false)
  })

  it('envia solicitudes solo al interesado y a coordinacion', async () => {
    const url = await startRealtime()
    const solicitante = client(url, 'solicitante')
    const coordinador = client(url, 'coordinador')
    const ajeno = client(url, 'ajeno')
    await Promise.all([connected(solicitante), connected(coordinador), connected(ajeno)])

    const avisoSolicitante = waitForEvent(solicitante, 'solicitud-puesto:updated')
    const avisoCoordinador = waitForEvent(coordinador, 'solicitud-puesto:updated')
    const avisoAjeno = waitForSilence(ajeno, 'solicitud-puesto:updated')

    emitRestrictedRealtime(
      'solicitud-puesto:updated',
      { solicitudId: 'sol-1', estado: 'PENDIENTE' },
      [realtimeUserRoom('user-1'), realtimeRoleRoom('COORDINADOR')],
    )

    await expect(avisoSolicitante).resolves.toMatchObject({ solicitudId: 'sol-1', estado: 'PENDIENTE' })
    await expect(avisoCoordinador).resolves.toMatchObject({ solicitudId: 'sol-1', estado: 'PENDIENTE' })
    await expect(avisoAjeno).resolves.toBe(false)
  })

  it('emite en eventos generales solo el identificador necesario', async () => {
    const url = await startRealtime()
    const solicitante = client(url, 'solicitante')
    await connected(solicitante)

    const aviso = waitForEvent(solicitante, 'donacion:updated')
    emitRealtime('donacion:updated', { donacionId: 'don-1', puestoId: 'puesto-1' })

    const payload = await aviso
    expect(payload).toMatchObject({ donacionId: 'don-1', puestoId: 'puesto-1' })
    expect(payload).not.toHaveProperty('donacion')
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('telefono')
    expect(payload).not.toHaveProperty('dni')
  })
})
