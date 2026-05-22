import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    puestoEmergencia: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    solicitudPuesto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
        solicitudPuesto: prismaMock.solicitudPuesto,
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

  it('lista las solicitudes para el coordinador', async () => {
    const app = await buildTestApp()
    mp.solicitudPuesto.findMany.mockResolvedValue([
      {
        id: 'solicitud-1',
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        descripcion: null,
        latitud: 39.4254,
        longitud: -0.4178,
        estado: 'PENDIENTE',
        createdAt: new Date('2026-05-09T10:00:00.000Z'),
        usuario: {
          id: 'user-1',
          nombre: 'Maria',
          apellidos: 'Garcia',
          email: 'maria@example.com',
          telefono: null,
          dni: '12345678A',
        },
        coordinador: null,
      },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes' })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitudes).toHaveLength(1)
    expect(mp.solicitudPuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
    }))
    await app.close()
  })

  it('acepta una solicitud y crea el puesto activo', async () => {
    const app = await buildTestApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({
      id: 'solicitud-1',
      usuarioId: 'user-1',
      nombre: 'CEIP La Paz',
      descripcion: null,
      direccion: 'Calle Mayor 12',
      latitud: 39.4254,
      longitud: -0.4178,
      tipo: 'colegio',
      estado: 'PENDIENTE',
    })
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.create.mockResolvedValue({
      id: 'puesto-1',
      nombre: 'CEIP La Paz',
      activo: true,
    })
    mp.solicitudPuesto.update.mockResolvedValue({ id: 'solicitud-1', estado: 'ACEPTADA' })

    const response = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(response.statusCode).toBe(200)
    expect(response.json().puesto).toMatchObject({ id: 'puesto-1', activo: true })
    expect(mp.puestoEmergencia.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminId: 'user-1',
        activo: true,
      }),
    }))
    expect(mp.solicitudPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'solicitud-1' },
      data: expect.objectContaining({ estado: 'ACEPTADA', coordinadorId: 'coord-1' }),
    }))
    await app.close()
  })

  it('rechaza una solicitud indicando motivo', async () => {
    const app = await buildTestApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE' })
    mp.solicitudPuesto.update.mockResolvedValue({
      id: 'solicitud-1',
      estado: 'RECHAZADA',
      motivoRechazo: 'Falta documentacion',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes/solicitud-1/rechazar',
      payload: { motivo: 'Falta documentacion' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud).toMatchObject({ estado: 'RECHAZADA' })
    expect(mp.solicitudPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'solicitud-1' },
      data: expect.objectContaining({
        estado: 'RECHAZADA',
        motivoRechazo: 'Falta documentacion',
        coordinadorId: 'coord-1',
      }),
    }))
    await app.close()
  })

  it('crea una solicitud para un usuario autenticado y le anade el rol de puesto', async () => {
    const app = await buildTestApp()
    mockAuthUser.id = 'user-1'
    mockAuthUser.sub = 'user-1'
    mockAuthUser.roles = ['CIUDADANO', 'VOLUNTARIO']
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.solicitudPuesto.findFirst.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO', 'VOLUNTARIO'] })
    mp.usuario.update.mockResolvedValue({})
    mp.solicitudPuesto.create.mockResolvedValue({
      id: 'solicitud-1',
      nombre: 'CEIP La Paz',
      estado: 'PENDIENTE',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes',
      payload: {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        latitud: 39.4254,
        longitud: -0.4178,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().solicitud).toMatchObject({ id: 'solicitud-1' })
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roles: ['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA'] },
    })
    expect(mp.solicitudPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ usuarioId: 'user-1', nombre: 'CEIP La Paz' }),
    }))
    await app.close()
  })
})
