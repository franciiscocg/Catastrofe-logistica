// @vitest-environment node
// Verifica el modelo de puesto con responsable principal unico y voluntarios de apoyo,
// asi como las metricas de las tarjetas del panel del coordinador:
//   - Cambio de responsable principal (PATCH /coordinador/:id/responsable)
//   - Alta de voluntarios de apoyo (POST /coordinador/:id/voluntarios)
//   - Metricas de tarjeta (responsables=1, personasTotales, estadoOperativo, tipo)
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    puestoEmergencia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    puestoTrabajador: { deleteMany: vi.fn() },
    asignacionPuesto: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    voluntario: { upsert: vi.fn() },
    usuario: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        puestoEmergencia: prismaMock.puestoEmergencia,
        puestoTrabajador: prismaMock.puestoTrabajador,
        asignacionPuesto: prismaMock.asignacionPuesto,
        voluntario: prismaMock.voluntario,
        usuario: prismaMock.usuario,
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

vi.mock('../../../backend/src/modules/puestos/trabajadores.service.js', () => ({
  listTrabajadores: vi.fn(),
  addTrabajador: vi.fn(),
  removeTrabajador: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { puestosRouter } from '../../../backend/src/modules/puestos/puestos.router.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const COORDINADOR_ID = 'coord-1'
const PUESTO_ID      = 'puesto-1'

const puestoConCuentas = {
  id: PUESTO_ID,
  nombre: 'Puesto Valencia Norte',
  descripcion: 'Centro de distribucion',
  direccion: 'Calle Mayor 1',
  latitud: 39.47,
  longitud: -0.37,
  tipo: 'DISTRIBUCION',
  activo: true,
  estadoSolicitud: 'APROBADO',
  motivoRechazo: null,
  capacidadTrabajo: 6,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  updatedAt: new Date('2026-05-11T10:00:00Z'),
  admin: { id: 'admin-1', nombre: 'Admin', apellidos: 'Puesto', email: 'admin@puesto.com', telefono: null },
  _count: { asignacionesVoluntarios: 2, trabajadores: 1, solicitudesParticipacion: 0, inventario: 1 },
}

async function buildTestApp() {
  const app = Fastify()
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  return app
}

function resetCoordinador() {
  vi.clearAllMocks()
  mockAuthUser.roles = ['COORDINADOR']
  mockAuthUser.id = COORDINADOR_ID
  mockAuthUser.sub = COORDINADOR_ID
}

// ── PATCH /coordinador/:id/responsable — responsable principal unico ──────────

describe('PATCH /coordinador/:id/responsable — cambio de responsable principal', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.puestoTrabajador.deleteMany.mockResolvedValue({ count: 0 })
    mp.usuario.update.mockResolvedValue({})
    mp.puestoEmergencia.update.mockResolvedValue({})
  })

  it('reasigna el responsable principal, le da el rol y registra CAMBIAR_RESPONSABLE_PUESTO', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique
      .mockResolvedValueOnce({ adminId: 'admin-old' })
      .mockResolvedValue(puestoConCuentas)
    mp.usuario.findUnique.mockResolvedValue({ id: 'user-new', email: 'nuevo@puesto.com', roles: [] })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: { email: 'nuevo@puesto.com' },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-new' } }),
    )
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PUESTO_ID }, data: { adminId: 'user-new' } }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'CAMBIAR_RESPONSABLE_PUESTO' }) }),
    )
    await app.close()
  })

  it('devuelve 400 si no se envia el email', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(mp.puestoEmergencia.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si el puesto no existe', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: { email: 'nuevo@puesto.com' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 404 si el usuario indicado no existe', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: 'admin-old' })
    mp.usuario.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: { email: 'desconocido@puesto.com' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 400 si el usuario ya es el responsable del puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ adminId: 'user-actual' })
    mp.usuario.findUnique.mockResolvedValue({ id: 'user-actual', email: 'actual@puesto.com', roles: ['PUESTO_EMERGENCIA'] })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: { email: 'actual@puesto.com' },
    })

    expect(response.statusCode).toBe(400)
    expect(mp.puestoEmergencia.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}/responsable`,
      payload: { email: 'nuevo@puesto.com' },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /coordinador/:id/voluntarios — voluntarios de apoyo ──────────────────

describe('POST /coordinador/:id/voluntarios — alta de voluntarios de apoyo', () => {
  beforeEach(() => {
    resetCoordinador()
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.voluntario.upsert.mockResolvedValue({ id: 'vol-1' })
    mp.usuario.update.mockResolvedValue({})
  })

  it('asigna un voluntario de apoyo y registra ASIGNAR_VOLUNTARIO_PUESTO', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, activo: true, capacidadTrabajo: 6 })
    mp.usuario.findUnique.mockResolvedValue({ id: 'user-1', roles: ['VOLUNTARIO'] })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.create.mockResolvedValue({
      id: 'asig-1',
      voluntario: { usuario: { id: 'user-1', nombre: 'Ana', apellidos: 'Soler', email: 'ana@example.com', telefono: null } },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: { email: 'ana@example.com' },
    })

    expect(response.statusCode).toBe(201)
    expect(mp.asignacionPuesto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voluntarioId: 'vol-1', puestoId: PUESTO_ID }) }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ASIGNAR_VOLUNTARIO_PUESTO' }) }),
    )
    await app.close()
  })

  it('devuelve 400 si no se envia el email', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 404 si el puesto no está activo', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: { email: 'ana@example.com' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 400 si el voluntario ya está asignado a este puesto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, activo: true, capacidadTrabajo: 6 })
    mp.usuario.findUnique.mockResolvedValue({ id: 'user-1', roles: ['VOLUNTARIO'] })
    mp.asignacionPuesto.findFirst.mockResolvedValue({ id: 'asig-prev', puestoId: PUESTO_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: { email: 'ana@example.com' },
    })

    expect(response.statusCode).toBe(400)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 400 cuando el puesto está lleno', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID, activo: true, capacidadTrabajo: 6 })
    mp.usuario.findUnique.mockResolvedValue({ id: 'user-1', roles: ['VOLUNTARIO'] })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(6)

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: { email: 'ana@example.com' },
    })

    expect(response.statusCode).toBe(400)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/${PUESTO_ID}/voluntarios`,
      payload: { email: 'ana@example.com' },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /coordinador — metricas de tarjeta y tipo de puesto ───────────────────

describe('GET /coordinador — metricas de tarjeta del panel administrativo', () => {
  beforeEach(resetCoordinador)

  it('expone responsable único, personas totales, tipo y estado NECESITA_VOLUNTARIOS', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      {
        ...puestoConCuentas,
        _count: { asignacionesVoluntarios: 1, trabajadores: 1, solicitudesParticipacion: 0, inventario: 0 },
      },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.statusCode).toBe(200)
    const puesto = response.json().puestos[0]
    expect(puesto.responsables).toBe(1)
    expect(puesto.voluntariosActivos).toBe(1)
    expect(puesto.personasTotales).toBe(2)
    expect(puesto.tipo).toBe('DISTRIBUCION')
    expect(puesto.estadoOperativo).toBe('NECESITA_VOLUNTARIOS')
    await app.close()
  })
})
