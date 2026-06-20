// @vitest-environment node
// Verifica la gestion administrativa de incidencias por el coordinador:
//   - Eliminacion administrativa de una incidencia (DELETE /:id)
//   - Edicion de una incidencia (PATCH /coordinador/:id)
//   - Listado y retirada de voluntarios de una incidencia (GET/DELETE /coordinador/:id/voluntarios)
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    incidenciaVia: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asignacionIncidencia: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    comentarioIncidenciaVia: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        incidenciaVia: prismaMock.incidenciaVia,
        asignacionIncidencia: prismaMock.asignacionIncidencia,
        comentarioIncidenciaVia: prismaMock.comentarioIncidenciaVia,
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

vi.mock('../../../backend/src/lib/realtime.js', () => ({
  emitRealtime: vi.fn(),
  emitRestrictedRealtime: vi.fn(),
  realtimePuestoRoom: vi.fn((id: string) => `puesto:${id}`),
  realtimeRoleRoom: vi.fn((role: string) => `role:${role}`),
  realtimeUserRoom: vi.fn((id: string) => `user:${id}`),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { incidenciasRouter } from '../../../backend/src/modules/incidencias/incidencias.router.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const COORDINADOR_ID = 'coord-1'
const INCIDENCIA_ID = 'inc-1'
const ASIGNACION_ID = 'asig-inc-1'

const incidenciaBase = {
  id: INCIDENCIA_ID,
  titulo: 'Calle cortada',
  categoria: 'inundacion',
  latitud: 39.42,
  longitud: -0.41,
  estado: 'CORTADA',
  descripcion: 'Agua acumulada',
  createdAt: new Date('2026-05-10T10:00:00Z'),
  updatedAt: new Date('2026-05-10T10:00:00Z'),
}

async function buildTestApp() {
  const app = Fastify()
  await app.register(incidenciasRouter, { prefix: '/api/incidencias' })
  return app
}

function resetCoordinador() {
  vi.clearAllMocks()
  mockAuthUser.roles = ['COORDINADOR']
  mockAuthUser.id = COORDINADOR_ID
  mockAuthUser.sub = COORDINADOR_ID
}

// ── DELETE /:id — eliminacion administrativa de incidencia ────────────────────

describe('DELETE /:id — eliminación administrativa de incidencia', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.asignacionIncidencia.deleteMany.mockResolvedValue({ count: 0 })
    mp.comentarioIncidenciaVia.deleteMany.mockResolvedValue({ count: 0 })
    mp.incidenciaVia.delete.mockResolvedValue({})
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('borra asignaciones, comentarios e incidencia y registra ELIMINAR_INCIDENCIA', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(incidenciaBase)

    const response = await app.inject({ method: 'DELETE', url: `/api/incidencias/${INCIDENCIA_ID}` })

    expect(response.statusCode).toBe(204)
    expect(mp.asignacionIncidencia.deleteMany).toHaveBeenCalledWith({ where: { incidenciaId: INCIDENCIA_ID } })
    expect(mp.comentarioIncidenciaVia.deleteMany).toHaveBeenCalledWith({ where: { incidenciaId: INCIDENCIA_ID } })
    expect(mp.incidenciaVia.delete).toHaveBeenCalledWith({ where: { id: INCIDENCIA_ID } })
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ELIMINAR_INCIDENCIA' }) }),
    )
    await app.close()
  })

  it('devuelve 404 si la incidencia no existe', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'DELETE', url: '/api/incidencias/no-existe' })

    expect(response.statusCode).toBe(404)
    expect(mp.incidenciaVia.delete).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({ method: 'DELETE', url: `/api/incidencias/${INCIDENCIA_ID}` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── PATCH /coordinador/:id — edicion de incidencia ────────────────────────────

describe('PATCH /coordinador/:id — edicion administrativa de incidencia', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.asignacionIncidencia.updateMany.mockResolvedValue({ count: 0 })
  })

  it('actualiza la incidencia y registra EDITAR_INCIDENCIA', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(incidenciaBase)
    mp.incidenciaVia.update.mockResolvedValue({ ...incidenciaBase, titulo: 'Calle reparada' })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}`,
      payload: { titulo: 'Calle reparada' },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.incidenciaVia.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INCIDENCIA_ID } }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'EDITAR_INCIDENCIA' }) }),
    )
    await app.close()
  })

  it('al marcar TRANSITABLE finaliza las asignaciones activas', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(incidenciaBase)
    mp.incidenciaVia.update.mockResolvedValue({ ...incidenciaBase, estado: 'TRANSITABLE' })
    mp.asignacionIncidencia.updateMany.mockResolvedValue({ count: 2 })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}`,
      payload: { estado: 'TRANSITABLE' },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.asignacionIncidencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { incidenciaId: INCIDENCIA_ID, estado: 'ACTIVA' },
        data: expect.objectContaining({ estado: 'FINALIZADA' }),
      }),
    )
    await app.close()
  })

  it('devuelve 404 si la incidencia no existe', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/incidencias/coordinador/no-existe',
      payload: { titulo: 'Nuevo titulo' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}`,
      payload: { titulo: 'Nuevo titulo' },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /coordinador/:id/voluntarios — listado de voluntarios ─────────────────

describe('GET /coordinador/:id/voluntarios — voluntarios de una incidencia', () => {
  beforeEach(resetCoordinador)

  it('devuelve los voluntarios activos de la incidencia', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: INCIDENCIA_ID })
    mp.asignacionIncidencia.findMany.mockResolvedValue([
      {
        id: ASIGNACION_ID,
        startedAt: new Date(),
        voluntario: { usuario: { nombre: 'Ana', apellidos: 'Soler', email: 'ana@example.com', telefono: null } },
      },
    ])

    const response = await app.inject({ method: 'GET', url: `/api/incidencias/coordinador/${INCIDENCIA_ID}/voluntarios` })

    expect(response.statusCode).toBe(200)
    expect(response.json().voluntarios).toHaveLength(1)
    await app.close()
  })

  it('devuelve 404 si la incidencia no existe', async () => {
    const app = await buildTestApp()
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'GET', url: '/api/incidencias/coordinador/no-existe/voluntarios' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({ method: 'GET', url: `/api/incidencias/coordinador/${INCIDENCIA_ID}/voluntarios` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── DELETE /coordinador/:id/voluntarios/:asignacionId — retirar voluntario ────

describe('DELETE /coordinador/:id/voluntarios/:asignacionId — retirar voluntario de incidencia', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('cancela la asignación activa y registra RETIRAR_VOLUNTARIO_INCIDENCIA', async () => {
    const app = await buildTestApp()
    mp.asignacionIncidencia.findFirst.mockResolvedValue({ id: ASIGNACION_ID, voluntarioId: 'vol-1' })
    mp.asignacionIncidencia.update.mockResolvedValue({ id: ASIGNACION_ID, estado: 'CANCELADA' })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}/voluntarios/${ASIGNACION_ID}`,
    })

    expect(response.statusCode).toBe(204)
    expect(mp.asignacionIncidencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASIGNACION_ID },
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'RETIRAR_VOLUNTARIO_INCIDENCIA' }) }),
    )
    await app.close()
  })

  it('devuelve 404 si la asignación activa no existe', async () => {
    const app = await buildTestApp()
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}/voluntarios/no-existe`,
    })

    expect(response.statusCode).toBe(404)
    expect(mp.asignacionIncidencia.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/incidencias/coordinador/${INCIDENCIA_ID}/voluntarios/${ASIGNACION_ID}`,
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})
