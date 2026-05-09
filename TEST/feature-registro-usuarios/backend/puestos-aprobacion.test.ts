import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    puestoEmergencia: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    catastrofe: {
      findFirst: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        puestoEmergencia: prismaMock.puestoEmergencia,
        catastrofe: prismaMock.catastrofe,
        usuario: prismaMock.usuario,
      }),
    ),
  }
  return {
    mockAuthUser: { id: 'coord-1', sub: 'coord-1', roles: ['COORDINADOR'] as string[] },
    prismaMock,
  }
})

vi.mock('../../../backend/src/middleware/auth.middleware.js', () => ({
  requireAuth: vi.fn(async (request) => {
    request.user = mockAuthUser
  }),
}))

vi.mock('../../../backend/src/middleware/rbac.middleware.js', () => ({
  requireRole: vi.fn((...roles: string[]) => async (_request, reply) => {
    if (!roles.some((role) => mockAuthUser.roles.includes(role))) {
      reply.status(403).send({ error: 'No tienes permiso para esta accion' })
    }
  }),
}))

vi.mock('../../../backend/src/modules/puestos/trabajadores.service.js', () => ({
  listTrabajadores: vi.fn(),
  addTrabajador: vi.fn(),
  removeTrabajador: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: prismaMock,
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { puestosRouter } from '../../../backend/src/modules/puestos/puestos.router.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

async function buildTestApp() {
  const app = Fastify()
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  return app
}

describe('aprobacion de solicitudes de puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = 'coord-1'
    mockAuthUser.sub = 'coord-1'
    mockAuthUser.roles = ['COORDINADOR']
  })

  it('lista las solicitudes pendientes para el coordinador', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      {
        id: 'puesto-1',
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        descripcion: null,
        latitud: 39.4254,
        longitud: -0.4178,
        createdAt: new Date('2026-05-09T10:00:00.000Z'),
        admin: {
          id: 'user-1',
          nombre: 'Maria',
          apellidos: 'Garcia',
          email: 'maria@example.com',
          dni: '12345678A',
        },
      },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/pendientes' })

    expect(response.statusCode).toBe(200)
    expect(response.json().puestos).toHaveLength(1)
    expect(mp.puestoEmergencia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { estadoSolicitud: 'PENDIENTE' },
    }))
    await app.close()
  })

  it('aprueba un puesto y lo activa', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: 'puesto-1' })
    mp.puestoEmergencia.update.mockResolvedValue({
      id: 'puesto-1',
      nombre: 'CEIP La Paz',
      activo: true,
      estadoSolicitud: 'APROBADO',
    })

    const response = await app.inject({ method: 'PATCH', url: '/api/puestos/puesto-1/aprobar' })

    expect(response.statusCode).toBe(200)
    expect(response.json().puesto).toMatchObject({ activo: true, estadoSolicitud: 'APROBADO' })
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'puesto-1' },
      data: { activo: true, estadoSolicitud: 'APROBADO', motivoRechazo: null },
    }))
    await app.close()
  })

  it('rechaza un puesto, guarda el motivo y retira el rol si no quedan solicitudes vivas', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: 'user-1' })
    mp.puestoEmergencia.count.mockResolvedValue(0)
    mp.usuario.findUnique.mockResolvedValue({
      id: 'user-1',
      roles: ['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA'],
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/puestos/puesto-1/rechazar',
      payload: { motivo: 'Falta documentacion' },
    })

    expect(response.statusCode).toBe(204)
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'puesto-1' },
      data: expect.objectContaining({
        activo: false,
        estadoSolicitud: 'RECHAZADO',
        motivoRechazo: 'Falta documentacion',
      }),
    }))
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roles: ['CIUDADANO', 'VOLUNTARIO'] },
    })
    await app.close()
  })

  it('reutiliza una solicitud rechazada cuando el usuario envia otra', async () => {
    const app = await buildTestApp()
    mockAuthUser.id = 'user-1'
    mockAuthUser.sub = 'user-1'
    mockAuthUser.roles = ['CIUDADANO', 'VOLUNTARIO']
    mp.catastrofe.findFirst.mockResolvedValue({ id: 'cat-1' })
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO', 'VOLUNTARIO'] })
    mp.usuario.update.mockResolvedValue({})
    mp.puestoEmergencia.findFirst.mockResolvedValue({
      id: 'puesto-1',
      estadoSolicitud: 'RECHAZADO',
    })
    mp.puestoEmergencia.update.mockResolvedValue({
      id: 'puesto-1',
      nombre: 'CEIP La Paz',
      direccion: 'Calle Mayor 12',
      tipo: 'colegio',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitar',
      payload: {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        latitud: 39.4254,
        longitud: -0.4178,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roles: ['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA'] },
    })
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'puesto-1' },
      data: expect.objectContaining({
        estadoSolicitud: 'PENDIENTE',
        motivoRechazo: null,
        activo: false,
      }),
    }))
    await app.close()
  })
})
