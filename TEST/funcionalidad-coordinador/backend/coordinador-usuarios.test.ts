// @vitest-environment node
// Verifica la gestion administrativa de usuarios por el coordinador:
//   - Listado de usuarios para el panel administrativo (GET /coordinador)
//   - Gestion de roles / estado activo (PATCH /coordinador/:id)
//   - Eliminacion administrativa con anonimizado y salvaguardas (DELETE /coordinador/:id)
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    usuario: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    voluntario: { upsert: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    puestoTrabajador: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        usuario: prismaMock.usuario,
        voluntario: prismaMock.voluntario,
        refreshToken: prismaMock.refreshToken,
        puestoTrabajador: prismaMock.puestoTrabajador,
        auditLog: prismaMock.auditLog,
      }),
    ),
  }
  return {
    mockAuthUser: { id: 'coord-1', sub: 'coord-1', roles: ['COORDINADOR'] as string[] },
    prismaMock,
  }
})

vi.mock('../../../backend/src/middleware/auth.middleware.js', () => ({
  requireAuth: vi.fn(async (request) => { request.user = mockAuthUser }),
}))

vi.mock('../../../backend/src/middleware/rbac.middleware.js', () => ({
  requireRole: vi.fn((...roles: string[]) => async (_request, reply) => {
    if (!roles.some((r) => mockAuthUser.roles.includes(r))) {
      reply.status(403).send({ error: 'No tienes permiso para está accion' })
    }
  }),
}))

vi.mock('../../../backend/src/modules/auth/auth.service.js', () => ({
  sanitizeUser: vi.fn((user) => user),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { usersRouter } from '../../../backend/src/modules/users/users.router.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const COORDINADOR_ID = 'coord-1'

const usuarioCiudadano = {
  id: 'user-9',
  email: 'ciudadano@example.com',
  nombre: 'Lucia',
  apellidos: 'Martin',
  telefono: null,
  roles: ['CIUDADANO'],
  activo: true,
  emailVerified: true,
  createdAt: new Date('2026-05-01T10:00:00Z'),
}

async function buildTestApp() {
  const app = Fastify()
  await app.register(usersRouter, { prefix: '/api/users' })
  return app
}

function resetCoordinador() {
  vi.clearAllMocks()
  mockAuthUser.roles = ['COORDINADOR']
  mockAuthUser.id = COORDINADOR_ID
  mockAuthUser.sub = COORDINADOR_ID
}

// ── GET /coordinador — listado administrativo de usuarios ─────────────────────

describe('GET /coordinador — listado de usuarios para el panel administrativo', () => {
  beforeEach(resetCoordinador)

  it('devuelve la lista de usuarios con sus roles y estado', async () => {
    const app = await buildTestApp()
    mp.usuario.findMany.mockResolvedValue([usuarioCiudadano])

    const response = await app.inject({ method: 'GET', url: '/api/users/coordinador' })

    expect(response.statusCode).toBe(200)
    expect(response.json().usuarios).toHaveLength(1)
    expect(response.json().usuarios[0].roles).toContain('CIUDADANO')
    expect(response.json().usuarios[0].activo).toBe(true)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['CIUDADANO']

    const response = await app.inject({ method: 'GET', url: '/api/users/coordinador' })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── PATCH /coordinador/:id — gestion de roles y estado ────────────────────────

describe('PATCH /coordinador/:id — gestion de roles y estado del usuario', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.usuario.update.mockResolvedValue({ ...usuarioCiudadano, roles: ['CIUDADANO', 'VOLUNTARIO'] })
    mp.voluntario.upsert.mockResolvedValue({ id: 'vol-1' })
  })

  it('asigna el rol VOLUNTARIO creando el perfil y registra GESTIONAR_USUARIO', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue({ id: usuarioCiudadano.id, roles: ['CIUDADANO'], activo: true })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/coordinador/${usuarioCiudadano.id}`,
      payload: { roles: ['CIUDADANO', 'VOLUNTARIO'] },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.voluntario.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: usuarioCiudadano.id } }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'GESTIONAR_USUARIO' }) }),
    )
    await app.close()
  })

  it('al desactivar a un usuario revoca sus refresh tokens', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue({ id: usuarioCiudadano.id, roles: ['CIUDADANO'], activo: true })
    mp.usuario.update.mockResolvedValue({ ...usuarioCiudadano, activo: false })
    mp.refreshToken.updateMany.mockResolvedValue({ count: 1 })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/coordinador/${usuarioCiudadano.id}`,
      payload: { activo: false },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: usuarioCiudadano.id, revokedAt: null } }),
    )
    await app.close()
  })

  it('impide que el coordinador se desactive a si mismo', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/coordinador/${COORDINADOR_ID}`,
      payload: { activo: false },
    })

    expect(response.statusCode).toBe(400)
    expect(mp.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('impide que el coordinador se retire su propio rol de coordinador', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/coordinador/${COORDINADOR_ID}`,
      payload: { roles: ['CIUDADANO'] },
    })

    expect(response.statusCode).toBe(400)
    expect(mp.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si el usuario no existe', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/coordinador/no-existe',
      payload: { activo: true },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/coordinador/${usuarioCiudadano.id}`,
      payload: { activo: true },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── DELETE /coordinador/:id — eliminacion administrativa ──────────────────────

describe('DELETE /coordinador/:id — eliminación administrativa de usuario', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.refreshToken.updateMany.mockResolvedValue({ count: 0 })
    mp.puestoTrabajador.deleteMany.mockResolvedValue({ count: 0 })
    mp.usuario.update.mockResolvedValue({})
  })

  it('anonimiza la cuenta, revoca tokens y registra ELIMINAR_USUARIO', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue({
      id: usuarioCiudadano.id,
      email: usuarioCiudadano.email,
      nombre: usuarioCiudadano.nombre,
      apellidos: usuarioCiudadano.apellidos,
      roles: ['CIUDADANO'],
      activo: true,
    })

    const response = await app.inject({ method: 'DELETE', url: `/api/users/coordinador/${usuarioCiudadano.id}` })

    expect(response.statusCode).toBe(200)
    expect(response.json().ok).toBe(true)
    expect(mp.refreshToken.updateMany).toHaveBeenCalled()
    expect(mp.puestoTrabajador.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: usuarioCiudadano.id } })
    expect(mp.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: usuarioCiudadano.id },
        data: expect.objectContaining({
          activo: false,
          roles: ['CIUDADANO'],
          email: expect.stringContaining('@deleted.local'),
        }),
      }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ELIMINAR_USUARIO' }) }),
    )
    await app.close()
  })

  it('impide que el coordinador elimine su propia cuenta', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'DELETE', url: `/api/users/coordinador/${COORDINADOR_ID}` })

    expect(response.statusCode).toBe(400)
    expect(mp.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si el usuario a eliminar no existe', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'DELETE', url: '/api/users/coordinador/no-existe' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('impide eliminar al ultimo coordinador activo', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue({
      id: 'coord-2',
      email: 'coord2@example.com',
      nombre: 'Otro',
      apellidos: 'Coordinador',
      roles: ['COORDINADOR'],
      activo: true,
    })
    mp.usuario.count.mockResolvedValue(1)

    const response = await app.inject({ method: 'DELETE', url: '/api/users/coordinador/coord-2' })

    expect(response.statusCode).toBe(400)
    expect(mp.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('permite eliminar a un coordinador si queda mas de uno activo', async () => {
    const app = await buildTestApp()
    mp.usuario.findUnique.mockResolvedValue({
      id: 'coord-2',
      email: 'coord2@example.com',
      nombre: 'Otro',
      apellidos: 'Coordinador',
      roles: ['COORDINADOR'],
      activo: true,
    })
    mp.usuario.count.mockResolvedValue(3)

    const response = await app.inject({ method: 'DELETE', url: '/api/users/coordinador/coord-2' })

    expect(response.statusCode).toBe(200)
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ELIMINAR_USUARIO' }) }),
    )
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({ method: 'DELETE', url: `/api/users/coordinador/${usuarioCiudadano.id}` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})
