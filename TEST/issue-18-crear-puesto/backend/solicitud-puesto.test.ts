import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    puestoEmergencia: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create:    vi.fn(),
    },
    solicitudPuesto: {
      findMany:  vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
    catastrofe: {
      findFirst: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        puestoEmergencia: prismaMock.puestoEmergencia,
        solicitudPuesto:  prismaMock.solicitudPuesto,
        catastrofe:       prismaMock.catastrofe,
        usuario:          prismaMock.usuario,
      }),
    ),
  }
  return {
    mockAuthUser: { id: 'user-1', sub: 'user-1', roles: ['CIUDADANO'] as string[] },
    prismaMock,
  }
})

vi.mock('../../../backend/src/middleware/auth.middleware.js', () => ({
  requireAuth: vi.fn(async (request) => { request.user = mockAuthUser }),
}))

vi.mock('../../../backend/src/middleware/rbac.middleware.js', () => ({
  requireRole: vi.fn((...roles: string[]) => async (_req, reply) => {
    if (!roles.some((r) => mockAuthUser.roles.includes(r))) {
      reply.status(403).send({ error: 'No tienes permiso para esta accion' })
    }
  }),
}))

vi.mock('../../../backend/src/modules/puestos/trabajadores.service.js', () => ({
  listTrabajadores: vi.fn(),
  addTrabajador:    vi.fn(),
  removeTrabajador: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { puestosRouter } from '../../../backend/src/modules/puestos/puestos.router.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

async function buildApp() {
  const app = Fastify()
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  return app
}

// ── GET /solicitudes/mia ──────────────────────────────────────────────────────

describe('GET /api/puestos/solicitudes/mia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id    = 'user-1'
    mockAuthUser.sub   = 'user-1'
    mockAuthUser.roles = ['CIUDADANO']  // sin PUESTO_EMERGENCIA
  })

  it('devuelve la solicitud del usuario autenticado sin exigir rol PUESTO_EMERGENCIA', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findFirst.mockResolvedValue({
      id: 'solicitud-1',
      nombre: 'CEIP La Paz',
      estado: 'PENDIENTE',
      createdAt: new Date('2026-05-10T10:00:00.000Z'),
    })

    const res = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes/mia' })

    expect(res.statusCode).toBe(200)
    expect(res.json().solicitud).toMatchObject({ id: 'solicitud-1', estado: 'PENDIENTE' })
    expect(mp.solicitudPuesto.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { usuarioId: 'user-1' },
    }))
    await app.close()
  })

  it('devuelve null si el usuario no tiene ninguna solicitud', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findFirst.mockResolvedValue(null)

    const res = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes/mia' })

    expect(res.statusCode).toBe(200)
    expect(res.json().solicitud).toBeNull()
    await app.close()
  })

  it('devuelve la solicitud aunque el usuario ya tenga rol PUESTO_EMERGENCIA', async () => {
    mockAuthUser.roles = ['CIUDADANO', 'PUESTO_EMERGENCIA']
    const app = await buildApp()
    mp.solicitudPuesto.findFirst.mockResolvedValue({ id: 'solicitud-2', estado: 'ACEPTADA' })

    const res = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes/mia' })

    expect(res.statusCode).toBe(200)
    expect(res.json().solicitud.estado).toBe('ACEPTADA')
    await app.close()
  })
})

// ── POST /solicitudes ─────────────────────────────────────────────────────────

describe('POST /api/puestos/solicitudes', () => {
  const validPayload = {
    nombre: 'CEIP La Paz',
    tipo: 'colegio',
    direccion: 'Calle Mayor 12, Paiporta',
    latitud: 39.4254,
    longitud: -0.4178,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id    = 'user-1'
    mockAuthUser.sub   = 'user-1'
    mockAuthUser.roles = ['CIUDADANO']
  })

  it('crea la solicitud y asigna rol PUESTO_EMERGENCIA al usuario', async () => {
    const app = await buildApp()
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.solicitudPuesto.findFirst.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO'] })
    mp.usuario.update.mockResolvedValue({})
    mp.solicitudPuesto.create.mockResolvedValue({
      id: 'solicitud-1',
      nombre: 'CEIP La Paz',
      estado: 'PENDIENTE',
      usuario: { id: 'user-1', nombre: 'Maria', apellidos: 'Garcia', email: 'maria@example.com', telefono: null },
    })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes', payload: validPayload })

    expect(res.statusCode).toBe(201)
    expect(res.json().solicitud).toMatchObject({ id: 'solicitud-1', estado: 'PENDIENTE' })
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roles: ['CIUDADANO', 'PUESTO_EMERGENCIA'] },
    })
    await app.close()
  })

  it('no actualiza roles si el usuario ya tiene PUESTO_EMERGENCIA', async () => {
    const app = await buildApp()
    mockAuthUser.roles = ['CIUDADANO', 'PUESTO_EMERGENCIA']
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.solicitudPuesto.findFirst.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO', 'PUESTO_EMERGENCIA'] })
    mp.solicitudPuesto.create.mockResolvedValue({ id: 'solicitud-2', estado: 'PENDIENTE' })

    await app.inject({ method: 'POST', url: '/api/puestos/solicitudes', payload: validPayload })

    expect(mp.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 400 si el usuario ya tiene un puesto asociado', async () => {
    const app = await buildApp()
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: 'puesto-existente' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes', payload: validPayload })

    expect(res.statusCode).toBe(400)
    // Fastify serializa los errores como { error: 'Bad Request', message: '...' }.
    // El texto personalizado está en `message`, no en `error`.
    expect(res.json().message).toMatch(/puesto/)
    await app.close()
  })

  it('devuelve 400 si ya existe una solicitud PENDIENTE del usuario', async () => {
    const app = await buildApp()
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.solicitudPuesto.findFirst.mockResolvedValue({ id: 'solicitud-previa' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes', payload: validPayload })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/solicitud pendiente/)
    await app.close()
  })

  it('devuelve 400 si el nombre esta vacio', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes',
      payload: { ...validPayload, nombre: '' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/nombre/)
    await app.close()
  })

  it('devuelve 400 si la latitud esta fuera de rango', async () => {
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes',
      payload: { ...validPayload, latitud: 200 },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/latitud/)
    await app.close()
  })
})

// ── POST /solicitudes/:id/aceptar ─────────────────────────────────────────────

describe('POST /api/puestos/solicitudes/:id/aceptar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id    = 'coord-1'
    mockAuthUser.sub   = 'coord-1'
    mockAuthUser.roles = ['COORDINADOR']
  })

  it('acepta la solicitud y crea un PuestoEmergencia activo', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({
      id: 'solicitud-1', usuarioId: 'user-1',
      nombre: 'CEIP La Paz', descripcion: null,
      direccion: 'Calle Mayor 12', latitud: 39.4254, longitud: -0.4178,
      tipo: 'colegio', estado: 'PENDIENTE',
    })
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.create.mockResolvedValue({
      id: 'puesto-1', nombre: 'CEIP La Paz', activo: true,
    })
    mp.solicitudPuesto.update.mockResolvedValue({ id: 'solicitud-1', estado: 'ACEPTADA' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(res.statusCode).toBe(200)
    expect(res.json().puesto).toMatchObject({ id: 'puesto-1', activo: true })
    expect(mp.puestoEmergencia.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activo: true,
        adminId: 'user-1',
      }),
    }))
    expect(mp.solicitudPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'solicitud-1' },
      data: expect.objectContaining({ estado: 'ACEPTADA', coordinadorId: 'coord-1' }),
    }))
    await app.close()
  })

  it('acepta la solicitud aunque no haya ninguna catastrofe activa', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({
      id: 'solicitud-1', usuarioId: 'user-1',
      nombre: 'CEIP La Paz', descripcion: null,
      direccion: 'Calle Mayor 12', latitud: 39.4254, longitud: -0.4178,
      tipo: 'colegio', estado: 'PENDIENTE',
    })
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.create.mockResolvedValue({
      id: 'puesto-1', nombre: 'CEIP La Paz', activo: true,
    })
    mp.solicitudPuesto.update.mockResolvedValue({ id: 'solicitud-1', estado: 'ACEPTADA' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(res.statusCode).toBe(200)
    expect(mp.catastrofe.findFirst).not.toHaveBeenCalled()
    expect(mp.puestoEmergencia.create).toHaveBeenCalledOnce()
    await app.close()
  })

  it('devuelve 400 si la solicitud no esta PENDIENTE', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({ id: 'solicitud-1', estado: 'ACEPTADA' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/revisada/)
    await app.close()
  })

  it('devuelve 400 si el solicitante ya tiene puesto', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({
      id: 'solicitud-1', usuarioId: 'user-1', estado: 'PENDIENTE',
    })
    mp.catastrofe.findFirst.mockResolvedValue({ id: 'cat-1' })
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: 'puesto-ya-existe' })

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/puesto/)
    expect(mp.puestoEmergencia.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si la solicitud no existe', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue(null)

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/no-existe/aceptar' })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es COORDINADOR', async () => {
    mockAuthUser.roles = ['CIUDADANO']
    const app = await buildApp()

    const res = await app.inject({ method: 'POST', url: '/api/puestos/solicitudes/solicitud-1/aceptar' })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /solicitudes/:id/rechazar ────────────────────────────────────────────

describe('POST /api/puestos/solicitudes/:id/rechazar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id    = 'coord-1'
    mockAuthUser.sub   = 'coord-1'
    mockAuthUser.roles = ['COORDINADOR']
  })

  it('rechaza la solicitud indicando el motivo', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE' })
    mp.solicitudPuesto.update.mockResolvedValue({
      id: 'solicitud-1', estado: 'RECHAZADA', motivoRechazo: 'Falta documentacion',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes/solicitud-1/rechazar',
      payload: { motivo: 'Falta documentacion' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().solicitud).toMatchObject({ estado: 'RECHAZADA' })
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

  it('rechaza la solicitud sin motivo (motivo opcional)', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE' })
    mp.solicitudPuesto.update.mockResolvedValue({ id: 'solicitud-1', estado: 'RECHAZADA' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes/solicitud-1/rechazar',
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('devuelve 400 si la solicitud ya fue revisada', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findUnique.mockResolvedValue({ estado: 'RECHAZADA' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes/solicitud-1/rechazar',
      payload: { motivo: 'Motivo' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/revisada/)
    await app.close()
  })

  it('devuelve 403 si el usuario no es COORDINADOR', async () => {
    mockAuthUser.roles = ['CIUDADANO']
    const app = await buildApp()

    const res = await app.inject({
      method: 'POST',
      url: '/api/puestos/solicitudes/solicitud-1/rechazar',
      payload: { motivo: 'Motivo' },
    })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /solicitudes (coordinador) ────────────────────────────────────────────

describe('GET /api/puestos/solicitudes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id    = 'coord-1'
    mockAuthUser.sub   = 'coord-1'
    mockAuthUser.roles = ['COORDINADOR']
  })

  it('devuelve la lista completa de solicitudes para el coordinador', async () => {
    const app = await buildApp()
    mp.solicitudPuesto.findMany.mockResolvedValue([
      {
        id: 'solicitud-1', nombre: 'CEIP La Paz', tipo: 'colegio',
        direccion: 'Calle Mayor 12', estado: 'PENDIENTE',
        createdAt: new Date('2026-05-10T10:00:00.000Z'),
        usuario: { id: 'user-1', nombre: 'Maria', apellidos: 'Garcia', email: 'maria@example.com', telefono: null, dni: '12345678A' },
        coordinador: null,
      },
    ])

    const res = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes' })

    expect(res.statusCode).toBe(200)
    expect(res.json().solicitudes).toHaveLength(1)
    expect(res.json().solicitudes[0]).toMatchObject({ id: 'solicitud-1', estado: 'PENDIENTE' })
    expect(mp.solicitudPuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
    }))
    await app.close()
  })

  it('devuelve 403 si el usuario no es COORDINADOR', async () => {
    mockAuthUser.roles = ['CIUDADANO']
    const app = await buildApp()

    const res = await app.inject({ method: 'GET', url: '/api/puestos/solicitudes' })

    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
