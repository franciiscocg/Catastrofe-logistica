// @vitest-environment node
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    voluntario: { findUnique: vi.fn() },
    donacion: { findFirst: vi.fn() },
    puestoEmergencia: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    asignacionPuesto: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    solicitudParticipacionPuesto: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        voluntario: prismaMock.voluntario,
        donacion: prismaMock.donacion,
        puestoEmergencia: prismaMock.puestoEmergencia,
        asignacionPuesto: prismaMock.asignacionPuesto,
        solicitudParticipacionPuesto: prismaMock.solicitudParticipacionPuesto,
        auditLog: prismaMock.auditLog,
      }),
    ),
  }
  return {
    mockAuthUser: { id: 'vol-user-1', sub: 'vol-user-1', roles: ['VOLUNTARIO'] as string[] },
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
      reply.status(403).send({ error: 'No tienes permiso para está accion' })
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PUESTO_ID = 'puesto-1'
const VOLUNTARIO_ID = 'voluntario-1'
const VOL_USER_ID = 'vol-user-1'
const SOLICITUD_ID = 'solicitud-p-1'
const ASIGNACION_ID = 'asig-1'
const RESPONSABLE_ID = 'resp-1'

const puestoBase = {
  id: PUESTO_ID,
  nombre: 'Puesto Valencia Norte',
  direccion: 'Calle Mayor 1',
  latitud: 39.47,
  longitud: -0.37,
  tipo: 'DISTRIBUCION',
  activo: true,
  capacidadTrabajo: 6,
  adminId: RESPONSABLE_ID,
  catastrofeId: 'cat-1',
}

const voluntarioBase = {
  id: VOLUNTARIO_ID,
  usuario: {
    id: VOL_USER_ID,
    nombre: 'Juan',
    apellidos: 'Gomez',
    dni: '12345678A',
    email: 'juan@example.com',
    telefono: null,
  },
}

const solicitudBase = {
  id: SOLICITUD_ID,
  puestoId: PUESTO_ID,
  usuarioId: VOL_USER_ID,
  estado: 'PENDIENTE',
  createdAt: new Date('2026-05-11T10:00:00Z'),
  decidedAt: null,
  responsableId: null,
  motivoRechazo: null,
  usuario: {
    id: VOL_USER_ID,
    nombre: 'Juan',
    apellidos: 'Gomez',
    dni: '12345678A',
    email: 'juan@example.com',
    telefono: null,
  },
  puesto: {
    id: PUESTO_ID,
    nombre: 'Puesto Valencia Norte',
    direccion: 'Calle Mayor 1',
  },
  responsable: null,
}

async function buildTestApp() {
  const app = Fastify()
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  return app
}

// ── POST /:id/participaciones ─────────────────────────────────────────────────

describe('POST /:id/participaciones — solicitud de participación del voluntario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = VOL_USER_ID
    mockAuthUser.sub = VOL_USER_ID
    mockAuthUser.roles = ['VOLUNTARIO']
  })

  it('crea la solicitud de participación cuando todo es válido', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.solicitudParticipacionPuesto.findFirst.mockResolvedValue(null)
    mp.solicitudParticipacionPuesto.create.mockResolvedValue(solicitudBase)

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(201)
    expect(response.json().solicitud).toMatchObject({ id: SOLICITUD_ID, estado: 'PENDIENTE' })
    expect(mp.solicitudParticipacionPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ puestoId: PUESTO_ID, usuarioId: VOL_USER_ID }),
    }))
    expect(mp.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accion: 'SOLICITAR_PARTICIPACION_PUESTO',
        entidadId: PUESTO_ID,
      }),
    }))
    await app.close()
  })

  it('devuelve la solicitud pendiente existente sin crear otra (idempotente)', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.solicitudParticipacionPuesto.findFirst.mockResolvedValue(solicitudBase)

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(201)
    expect(response.json().solicitud.id).toBe(SOLICITUD_ID)
    expect(mp.solicitudParticipacionPuesto.create).not.toHaveBeenCalled()
    expect(mp.auditLog.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si el voluntario tiene una donación activa', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue({ id: 'don-activa' })

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/donación activa/i)
    expect(mp.solicitudParticipacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si el voluntario ya está asignado activamente a otro puesto', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: 'asig-otro',
      puestoId: 'puesto-otro',
      estado: 'ACTIVA',
      puesto: { id: 'puesto-otro', nombre: 'Puesto Sur', direccion: 'Calle Sur 1', latitud: 39.4, longitud: -0.4, tipo: 'APOYO', activo: true, catastrofeId: 'cat-1' },
    })

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/Puesto Sur/)
    await app.close()
  })

  it('bloquea con 400 si el voluntario ya forma parte activa del mismo puesto', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: ASIGNACION_ID,
      puestoId: PUESTO_ID,
      estado: 'ACTIVA',
      puesto: puestoBase,
    })

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/ya formas parte activa/i)
    await app.close()
  })

  it('bloquea con 400 si el puesto está lleno en el momento de la solicitud', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 3, nombre: 'Puesto Valencia Norte' })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(3)

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/lleno/i)
    expect(mp.solicitudParticipacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si el puesto no existe o no está activo', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)

    const response = await app.inject({ method: 'POST', url: '/api/puestos/puesto-inexistente/participaciones' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 400 si el usuario no tiene perfil de voluntario', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/perfil de voluntario/i)
    await app.close()
  })

  it('devuelve 403 si el usuario no tiene rol VOLUNTARIO', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['CIUDADANO']

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/participaciones` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /:id/solicitudes-participacion ────────────────────────────────────────

describe('GET /:id/solicitudes-participación — listado para responsable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = RESPONSABLE_ID
    mockAuthUser.sub = RESPONSABLE_ID
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']
  })

  it('lista todas las solicitudes del puesto para el responsable', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.solicitudParticipacionPuesto.findMany.mockResolvedValue([solicitudBase])

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/solicitudes-participacion` })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitudes).toHaveLength(1)
    expect(mp.solicitudParticipacionPuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { puestoId: PUESTO_ID },
    }))
    await app.close()
  })

  it('devuelve lista vacia si no hay solicitudes', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.solicitudParticipacionPuesto.findMany.mockResolvedValue([])

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/solicitudes-participacion` })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitudes).toHaveLength(0)
    await app.close()
  })

  it('devuelve 403 si el usuario no es responsable del puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: 'otro-admin', trabajadores: [] })

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/solicitudes-participacion` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })

  it('devuelve 403 si el rol no es PUESTO_EMERGENCIA', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/solicitudes-participacion` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /participaciones/:solicitudId/aceptar ────────────────────────────────

describe('POST /participaciones/:solicitudId/aceptar — responsable acepta solicitud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = RESPONSABLE_ID
    mockAuthUser.sub = RESPONSABLE_ID
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']
  })

  it('acepta la solicitud y crea la asignación activa', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      puesto: { id: PUESTO_ID, capacidadTrabajo: 6, adminId: RESPONSABLE_ID },
    })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.create.mockResolvedValue({
      id: ASIGNACION_ID, voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID,
      estado: 'ACTIVA', startedAt: new Date(),
      puesto: puestoBase,
      voluntario: voluntarioBase,
    })
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({
      ...solicitudBase, estado: 'ACEPTADA', responsableId: RESPONSABLE_ID,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud).toMatchObject({ estado: 'ACEPTADA' })
    expect(response.json().asignacion).toMatchObject({ id: ASIGNACION_ID })
    expect(mp.asignacionPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID }),
    }))
    expect(mp.solicitudParticipacionPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({ estado: 'ACEPTADA', responsableId: RESPONSABLE_ID }),
    }))
    await app.close()
  })

  it('bloquea con 400 si la solicitud ya está revisada', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      estado: 'ACEPTADA',
      puesto: { id: PUESTO_ID, capacidadTrabajo: 6, adminId: RESPONSABLE_ID },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/ya está revisada/i)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 403 si el usuario no tiene acceso al puesto', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      puesto: { id: PUESTO_ID, capacidadTrabajo: 6, adminId: 'otro-admin' },
    })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: 'otro-admin', trabajadores: [] })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })

  it('bloquea con 400 si el puesto está lleno en el momento de aceptar', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      puesto: { id: PUESTO_ID, capacidadTrabajo: 3, adminId: RESPONSABLE_ID },
    })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(3)

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/lleno/i)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si el voluntario ya está participando en otro puesto', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      puesto: { id: PUESTO_ID, capacidadTrabajo: 6, adminId: RESPONSABLE_ID },
    })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: 'asig-otro', puestoId: 'puesto-otro', estado: 'ACTIVA',
      puesto: { ...puestoBase, id: 'puesto-otro', nombre: 'Puesto Sur' },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/Puesto Sur/i)
    await app.close()
  })

  it('devuelve 404 si la solicitud no existe', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/participaciones/solicitud-inexistente/aceptar',
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

// ── POST /participaciones/:solicitudId/rechazar ───────────────────────────────

describe('POST /participaciones/:solicitudId/rechazar — responsable rechaza solicitud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = RESPONSABLE_ID
    mockAuthUser.sub = RESPONSABLE_ID
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']
  })

  it('rechaza la solicitud con motivo', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE', puestoId: PUESTO_ID })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({
      ...solicitudBase,
      estado: 'RECHAZADA',
      motivoRechazo: 'Puesto ya cubierto',
      responsableId: RESPONSABLE_ID,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: { motivo: 'Puesto ya cubierto' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud).toMatchObject({ estado: 'RECHAZADA' })
    expect(mp.solicitudParticipacionPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SOLICITUD_ID },
      data: expect.objectContaining({
        estado: 'RECHAZADA',
        motivoRechazo: 'Puesto ya cubierto',
        responsableId: RESPONSABLE_ID,
      }),
    }))
    await app.close()
  })

  it('rechaza sin guardar motivo cuando no se proporciona', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE', puestoId: PUESTO_ID })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({
      ...solicitudBase,
      estado: 'RECHAZADA',
      motivoRechazo: null,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud.estado).toBe('RECHAZADA')
    await app.close()
  })

  it('bloquea con 400 si la solicitud ya está revisada', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'ACEPTADA', puestoId: PUESTO_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(mp.solicitudParticipacionPuesto.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si la solicitud no existe', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/participaciones/solicitud-inexistente/rechazar',
      payload: {},
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es responsable del puesto', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE', puestoId: PUESTO_ID })
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: 'otro-admin', trabajadores: [] })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: {},
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /:id/participantes ────────────────────────────────────────────────────

describe('GET /:id/participantes — listado de voluntarios activos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = RESPONSABLE_ID
    mockAuthUser.sub = RESPONSABLE_ID
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']
  })

  it('lista los participantes activos con sus datos de usuario', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.asignacionPuesto.findMany.mockResolvedValue([
      {
        id: ASIGNACION_ID,
        startedAt: new Date('2026-05-11T08:00:00Z'),
        voluntario: voluntarioBase,
      },
    ])

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/participantes` })

    expect(response.statusCode).toBe(200)
    expect(response.json().participantes).toHaveLength(1)
    expect(response.json().participantes[0]).toMatchObject({
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
    })
    expect(mp.asignacionPuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { puestoId: PUESTO_ID, estado: 'ACTIVA' },
    }))
    await app.close()
  })

  it('devuelve lista vacia si no hay participantes activos', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.asignacionPuesto.findMany.mockResolvedValue([])

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/participantes` })

    expect(response.statusCode).toBe(200)
    expect(response.json().participantes).toHaveLength(0)
    await app.close()
  })

  it('devuelve 403 si el usuario no es responsable del puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: 'otro-admin', trabajadores: [] })

    const response = await app.inject({ method: 'GET', url: `/api/puestos/${PUESTO_ID}/participantes` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── DELETE /:id/participantes/:asignacionId ───────────────────────────────────

describe('DELETE /:id/participantes/:asignacionId — eliminar voluntario activo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = RESPONSABLE_ID
    mockAuthUser.sub = RESPONSABLE_ID
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']
  })

  it('elimina al voluntario activo marcando la asignación como CANCELADA', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.asignacionPuesto.findFirst.mockResolvedValue({ id: ASIGNACION_ID })
    mp.asignacionPuesto.update.mockResolvedValue({ id: ASIGNACION_ID, estado: 'CANCELADA' })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/puestos/${PUESTO_ID}/participantes/${ASIGNACION_ID}`,
    })

    expect(response.statusCode).toBe(204)
    expect(mp.asignacionPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ASIGNACION_ID },
      data: expect.objectContaining({ estado: 'CANCELADA' }),
    }))
    await app.close()
  })

  it('devuelve 404 si la asignación activa no existe en ese puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: RESPONSABLE_ID, trabajadores: [] })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/puestos/${PUESTO_ID}/participantes/asig-inexistente`,
    })

    expect(response.statusCode).toBe(404)
    expect(mp.asignacionPuesto.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 403 si el usuario no es responsable del puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, adminId: 'otro-admin', trabajadores: [] })

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/puestos/${PUESTO_ID}/participantes/${ASIGNACION_ID}`,
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /:id/asignaciones (bloqueado con 410) ────────────────────────────────

describe('POST /:id/asignaciones — incorporacion directa bloqueada', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = VOL_USER_ID
    mockAuthUser.sub = VOL_USER_ID
    mockAuthUser.roles = ['VOLUNTARIO']
  })

  it('devuelve 410 Gone para el endpoint de asignación directa', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/asignaciones` })

    expect(response.statusCode).toBe(410)
    expect(response.json().message).toMatch(/solicitud de participación/i)
    await app.close()
  })
})

// ── POST /:id/asignaciones/finalizar ─────────────────────────────────────────

describe('POST /:id/asignaciones/finalizar — voluntario abandona el puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = VOL_USER_ID
    mockAuthUser.sub = VOL_USER_ID
    mockAuthUser.roles = ['VOLUNTARIO']
  })

  it('finaliza la asignación activa del voluntario registrando la hora de fin', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionPuesto.findFirst.mockResolvedValue({ id: ASIGNACION_ID })
    mp.asignacionPuesto.update.mockResolvedValue({
      id: ASIGNACION_ID,
      estado: 'FINALIZADA',
      endedAt: new Date(),
      puesto: puestoBase,
    })

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/asignaciones/finalizar` })

    expect(response.statusCode).toBe(200)
    expect(response.json().asignacion).toMatchObject({ id: ASIGNACION_ID, estado: 'FINALIZADA' })
    expect(mp.asignacionPuesto.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ASIGNACION_ID },
      data: expect.objectContaining({ estado: 'FINALIZADA' }),
    }))
    await app.close()
  })

  it('devuelve 404 si el voluntario no tiene asignación activa en ese puesto', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)

    const response = await app.inject({ method: 'POST', url: `/api/puestos/${PUESTO_ID}/asignaciones/finalizar` })

    expect(response.statusCode).toBe(404)
    expect(mp.asignacionPuesto.update).not.toHaveBeenCalled()
    await app.close()
  })
})

// ── GET /mis-solicitudes-participacion ───────────────────────────────────────

describe('GET /mis-solicitudes-participación — historial de solicitudes del voluntario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = VOL_USER_ID
    mockAuthUser.sub = VOL_USER_ID
    mockAuthUser.roles = ['VOLUNTARIO']
  })

  it('devuelve el historial de solicitudes de participación del voluntario', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findMany.mockResolvedValue([
      { ...solicitudBase, estado: 'ACEPTADA' },
      { ...solicitudBase, id: 'solicitud-2', estado: 'RECHAZADA' },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/mis-solicitudes-participacion' })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitudes).toHaveLength(2)
    expect(mp.solicitudParticipacionPuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { usuarioId: VOL_USER_ID },
    }))
    await app.close()
  })

  it('devuelve lista vacia si el voluntario no tiene solicitudes previas', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findMany.mockResolvedValue([])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/mis-solicitudes-participacion' })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitudes).toHaveLength(0)
    await app.close()
  })

  it('devuelve 403 si el usuario no tiene rol VOLUNTARIO', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['CIUDADANO']

    const response = await app.inject({ method: 'GET', url: '/api/puestos/mis-solicitudes-participacion' })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /mis-asignaciones/activa ─────────────────────────────────────────────

describe('GET /mis-asignaciones/activa — asignación activa del voluntario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.id = VOL_USER_ID
    mockAuthUser.sub = VOL_USER_ID
    mockAuthUser.roles = ['VOLUNTARIO']
  })

  it('devuelve la asignación activa del voluntario con datos del puesto', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
      puestoId: PUESTO_ID,
      estado: 'ACTIVA',
      startedAt: new Date(),
      puesto: puestoBase,
    })

    const response = await app.inject({ method: 'GET', url: '/api/puestos/mis-asignaciones/activa' })

    expect(response.statusCode).toBe(200)
    expect(response.json().asignacion).toMatchObject({ id: ASIGNACION_ID, puestoId: PUESTO_ID })
    await app.close()
  })

  it('devuelve asignación null si el voluntario no está en ningun puesto', async () => {
    const app = await buildTestApp()
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)

    const response = await app.inject({ method: 'GET', url: '/api/puestos/mis-asignaciones/activa' })

    expect(response.statusCode).toBe(200)
    expect(response.json().asignacion).toBeNull()
    await app.close()
  })
})
