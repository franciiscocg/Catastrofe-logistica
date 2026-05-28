// @vitest-environment node
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthUser, prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    puestoEmergencia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    asignacionPuesto: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    solicitudParticipacionPuesto: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    solicitudPuesto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    voluntario: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn(), update: vi.fn() },
    catastrofe: { findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    donacion: { findFirst: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        puestoEmergencia: prismaMock.puestoEmergencia,
        asignacionPuesto: prismaMock.asignacionPuesto,
        solicitudParticipacionPuesto: prismaMock.solicitudParticipacionPuesto,
        solicitudPuesto: prismaMock.solicitudPuesto,
        voluntario: prismaMock.voluntario,
        usuario: prismaMock.usuario,
        catastrofe: prismaMock.catastrofe,
        auditLog: prismaMock.auditLog,
        donacion: prismaMock.donacion,
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
      reply.status(403).send({ error: 'No tienes permiso para esta accion' })
    }
  }),
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COORDINADOR_ID = 'coord-1'
const PUESTO_ID      = 'puesto-1'
const SOLICITUD_ID   = 'solicitud-part-1'
const VOLUNTARIO_ID  = 'voluntario-1'
const VOL_USER_ID    = 'vol-user-1'
const ASIGNACION_ID  = 'asig-1'

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
  catastrofe: { id: 'cat-1', nombre: 'DANA Valencia', fase: 'RESPUESTA' },
  admin: { id: 'admin-1', nombre: 'Admin', apellidos: 'Puesto', email: 'admin@puesto.com', telefono: null },
  _count: { asignacionesVoluntarios: 2, trabajadores: 1, solicitudesParticipacion: 0, inventario: 1 },
}

const solicitudBase = {
  id: SOLICITUD_ID,
  puestoId: PUESTO_ID,
  usuarioId: VOL_USER_ID,
  estado: 'PENDIENTE',
  motivoRechazo: null,
  responsableId: null,
  decidedAt: null,
  createdAt: new Date('2026-05-11T09:00:00Z'),
  usuario: { id: VOL_USER_ID, nombre: 'Juan', apellidos: 'Gomez', dni: '12345678A', email: 'juan@example.com', telefono: null },
  responsable: null,
  puesto: { id: PUESTO_ID, capacidadTrabajo: 6, activo: true },
}

const asignacionActiva = {
  id: ASIGNACION_ID,
  voluntarioId: VOLUNTARIO_ID,
  puestoId: PUESTO_ID,
  estado: 'ACTIVA',
  startedAt: new Date(),
  puesto: { id: PUESTO_ID, nombre: 'Puesto Valencia Norte', direccion: 'Calle Mayor 1', latitud: 39.47, longitud: -0.37, tipo: 'DISTRIBUCION', activo: true, catastrofeId: 'cat-1' },
  voluntario: {
    id: VOLUNTARIO_ID,
    usuario: { id: VOL_USER_ID, nombre: 'Juan', apellidos: 'Gomez', email: 'juan@example.com', dni: '12345678A', telefono: null },
  },
}

async function buildTestApp() {
  const app = Fastify()
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  return app
}

// ── GET /coordinador — listado de puestos ─────────────────────────────────────

describe('GET /coordinador — listado de puestos para coordinador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
  })

  it('devuelve todos los puestos con conteos y estado operativo', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([puestoConCuentas])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.statusCode).toBe(200)
    expect(response.json().puestos).toHaveLength(1)
    const puesto = response.json().puestos[0]
    expect(puesto.id).toBe(PUESTO_ID)
    expect(puesto.estadoOperativo).toBeDefined()
    expect(puesto.voluntariosActivos).toBe(2)
    expect(puesto.responsables).toBe(1) // responsable principal
    await app.close()
  })

  it('calcula estadoOperativo CERRADO para puesto inactivo', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      { ...puestoConCuentas, activo: false },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.statusCode).toBe(200)
    expect(response.json().puestos[0].estadoOperativo).toBe('CERRADO')
    await app.close()
  })

  it('calcula estadoOperativo SATURADO cuando voluntariosActivos >= capacidadTrabajo', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      { ...puestoConCuentas, _count: { ...puestoConCuentas._count, asignacionesVoluntarios: 6 } },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.json().puestos[0].estadoOperativo).toBe('SATURADO')
    await app.close()
  })

  it('calcula estadoOperativo SIN_RECURSOS cuando hay necesidades y ningun voluntario', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      { ...puestoConCuentas, _count: { ...puestoConCuentas._count, asignacionesVoluntarios: 0, inventario: 2 } },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.json().puestos[0].estadoOperativo).toBe('SIN_RECURSOS')
    expect(response.json().puestos[0].necesitaVoluntarios).toBe(true)
    expect(response.json().puestos[0].necesitaRecursos).toBe(true)
    await app.close()
  })

  it('calcula estadoOperativo OPERATIVO cuando todo esta cubierto', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findMany.mockResolvedValue([
      {
        ...puestoConCuentas,
        _count: { asignacionesVoluntarios: 5, trabajadores: 1, solicitudesParticipacion: 0, inventario: 0 },
      },
    ])

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.json().puestos[0].estadoOperativo).toBe('OPERATIVO')
    await app.close()
  })

  it('devuelve 403 si el usuario no tiene rol COORDINADOR', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador' })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── PATCH /coordinador/:id — editar puesto ────────────────────────────────────

describe('PATCH /coordinador/:id — editar puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.puestoEmergencia.update.mockResolvedValue({})
  })

  it('actualiza el nombre del puesto y crea registro de auditoria EDITAR_PUESTO', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique
      .mockResolvedValueOnce({ id: PUESTO_ID })
      .mockResolvedValue(puestoConCuentas)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: { nombre: 'Puesto Valencia Actualizado' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().puesto.id).toBe(PUESTO_ID)
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nombre: 'Puesto Valencia Actualizado' }) }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'EDITAR_PUESTO' }) }),
    )
    await app.close()
  })

  it('al desactivar puesto cancela asignaciones activas y registra DESACTIVAR_PUESTO', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique
      .mockResolvedValueOnce({ id: PUESTO_ID })
      .mockResolvedValue({ ...puestoConCuentas, activo: false })
    mp.asignacionPuesto.updateMany.mockResolvedValue({ count: 2 })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: { activo: false },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.asignacionPuesto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puestoId: PUESTO_ID, estado: 'ACTIVA' },
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'DESACTIVAR_PUESTO' }) }),
    )
    await app.close()
  })

  it('actualiza capacidadTrabajo correctamente', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique
      .mockResolvedValueOnce({ id: PUESTO_ID })
      .mockResolvedValue(puestoConCuentas)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: { capacidadTrabajo: 10 },
    })

    expect(response.statusCode).toBe(200)
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capacidadTrabajo: 10 }) }),
    )
    await app.close()
  })

  it('devuelve 404 si el puesto no existe', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/puestos/coordinador/puesto-inexistente',
      payload: { nombre: 'Nuevo Nombre' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 400 si no se envia ningun campo para actualizar', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('devuelve 400 si capacidadTrabajo esta fuera del rango 1-500', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({ id: PUESTO_ID })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: { capacidadTrabajo: 600 },
    })

    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/puestos/coordinador/${PUESTO_ID}`,
      payload: { nombre: 'Nuevo Nombre' },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── DELETE /coordinador/:id — eliminar puesto ─────────────────────────────────

describe('DELETE /coordinador/:id — eliminacion logica de puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
    mp.asignacionPuesto.updateMany.mockResolvedValue({ count: 0 })
    mp.solicitudParticipacionPuesto.updateMany.mockResolvedValue({ count: 0 })
    mp.puestoEmergencia.update.mockResolvedValue({})
  })

  it('desactiva el puesto, cancela asignaciones y rechaza solicitudes pendientes', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique
      .mockResolvedValueOnce({ id: PUESTO_ID })
      .mockResolvedValue({ ...puestoConCuentas, activo: false, motivoRechazo: 'Puesto eliminado por coordinacion' })

    const response = await app.inject({ method: 'DELETE', url: `/api/puestos/coordinador/${PUESTO_ID}` })

    expect(response.statusCode).toBe(200)
    expect(mp.asignacionPuesto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puestoId: PUESTO_ID, estado: 'ACTIVA' },
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    )
    expect(mp.solicitudParticipacionPuesto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puestoId: PUESTO_ID, estado: 'PENDIENTE' },
        data: expect.objectContaining({ estado: 'RECHAZADA', motivoRechazo: 'Puesto eliminado por coordinacion' }),
      }),
    )
    expect(mp.puestoEmergencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activo: false, motivoRechazo: 'Puesto eliminado por coordinacion' }),
      }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ELIMINAR_PUESTO' }) }),
    )
    await app.close()
  })

  it('devuelve 404 si el puesto no existe', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'DELETE', url: '/api/puestos/coordinador/puesto-inexistente' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({ method: 'DELETE', url: `/api/puestos/coordinador/${PUESTO_ID}` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── GET /coordinador/:id/detalle — vista detallada ────────────────────────────

describe('GET /coordinador/:id/detalle — vista detallada del puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
  })

  it('devuelve el detalle completo del puesto con participantes, solicitudes y actividad', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue({
      ...puestoConCuentas,
      inventario: [],
      asignacionesVoluntarios: [
        {
          id: ASIGNACION_ID,
          startedAt: new Date(),
          voluntario: {
            id: VOLUNTARIO_ID,
            usuario: { id: VOL_USER_ID, nombre: 'Juan', apellidos: 'Gomez', email: 'juan@example.com', dni: '12345678A', telefono: null },
          },
        },
      ],
      solicitudesParticipacion: [solicitudBase],
      donaciones: [],
    })
    mp.auditLog.findMany.mockResolvedValue([
      { id: 'audit-1', accion: 'EDITAR_PUESTO', createdAt: new Date(), usuario: { nombre: 'Coordinador', apellidos: 'Demo', email: 'coord@example.com' } },
    ])

    const response = await app.inject({ method: 'GET', url: `/api/puestos/coordinador/${PUESTO_ID}/detalle` })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.puesto.id).toBe(PUESTO_ID)
    expect(body.participantes).toHaveLength(1)
    expect(body.participantes[0].voluntarioId).toBe(VOLUNTARIO_ID)
    expect(body.solicitudesParticipacion).toHaveLength(1)
    expect(body.actividad).toHaveLength(1)
    expect(body.actividad[0].accion).toBe('EDITAR_PUESTO')
    await app.close()
  })

  it('devuelve 404 si el puesto no existe', async () => {
    const app = await buildTestApp()
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    const response = await app.inject({ method: 'GET', url: '/api/puestos/coordinador/puesto-inexistente/detalle' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no es coordinador', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({ method: 'GET', url: `/api/puestos/coordinador/${PUESTO_ID}/detalle` })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /coordinador/participaciones/:id/aceptar — con reasignacion ──────────

describe('POST /coordinador/participaciones/:id/aceptar — aceptacion y reasignacion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('acepta solicitud creando nueva asignacion cuando voluntario no esta en ningun puesto', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(solicitudBase)
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.create.mockResolvedValue(asignacionActiva)
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({ ...solicitudBase, estado: 'ACEPTADA', responsableId: COORDINADOR_ID })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud.estado).toBe('ACEPTADA')
    expect(response.json().asignacion.id).toBe(ASIGNACION_ID)
    expect(mp.asignacionPuesto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID }) }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'ACEPTAR_PARTICIPACION_PUESTO' }) }),
    )
    await app.close()
  })

  it('reutiliza asignacion existente cuando el voluntario ya esta activo en ESTE puesto', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(solicitudBase)
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue({ ...asignacionActiva, puestoId: PUESTO_ID })
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.findUniqueOrThrow.mockResolvedValue(asignacionActiva)
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({ ...solicitudBase, estado: 'ACEPTADA' })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(200)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    expect(mp.asignacionPuesto.update).not.toHaveBeenCalled()
    expect(mp.asignacionPuesto.findUniqueOrThrow).toHaveBeenCalledOnce()
    await app.close()
  })

  it('reasigna al voluntario finalizando asignacion anterior cuando estaba en OTRO puesto', async () => {
    const app = await buildTestApp()
    const asignacionOtroPuesto = {
      ...asignacionActiva,
      id: 'asig-otro',
      puestoId: 'puesto-otro',
      puesto: { id: 'puesto-otro', nombre: 'Puesto Sur', direccion: 'Calle Sur 1', latitud: 39.4, longitud: -0.4, tipo: 'APOYO', activo: true, catastrofeId: 'cat-1' },
    }
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(solicitudBase)
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(asignacionOtroPuesto)
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.update.mockResolvedValue({ ...asignacionOtroPuesto, estado: 'FINALIZADA' })
    mp.asignacionPuesto.create.mockResolvedValue(asignacionActiva)
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({ ...solicitudBase, estado: 'ACEPTADA' })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(200)
    expect(mp.asignacionPuesto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asig-otro' }, data: expect.objectContaining({ estado: 'FINALIZADA' }) }),
    )
    expect(mp.asignacionPuesto.create).toHaveBeenCalledOnce()
    // El audit log debe registrar el puesto anterior
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datos: expect.objectContaining({ puestoAnteriorId: 'puesto-otro' }),
        }),
      }),
    )
    await app.close()
  })

  it('bloquea con 400 cuando el puesto esta lleno y el voluntario no esta en el', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(solicitudBase)
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.count.mockResolvedValue(6) // lleno (capacidad=6)

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/lleno/i)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si la solicitud ya esta revisada', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ ...solicitudBase, estado: 'ACEPTADA' })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si el puesto no esta activo', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({
      ...solicitudBase,
      puesto: { id: PUESTO_ID, capacidadTrabajo: 6, activo: false },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/no esta activo/i)
    await app.close()
  })

  it('bloquea con 400 si el usuario ya no tiene perfil de voluntario', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(solicitudBase)
    mp.voluntario.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/perfil de voluntario/i)
    await app.close()
  })

  it('devuelve 404 si la solicitud no existe', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/puestos/coordinador/participaciones/solicitud-inexistente/aceptar',
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no tiene rol COORDINADOR', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['PUESTO_EMERGENCIA']

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/aceptar`,
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

// ── POST /coordinador/participaciones/:id/rechazar ────────────────────────────

describe('POST /coordinador/participaciones/:id/rechazar — rechazo de solicitud', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.roles = ['COORDINADOR']
    mockAuthUser.id = COORDINADOR_ID
    mockAuthUser.sub = COORDINADOR_ID
    mp.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  })

  it('rechaza la solicitud con motivo y crea registro de auditoria', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE' })
    mp.solicitudParticipacionPuesto.update.mockResolvedValue({
      ...solicitudBase,
      estado: 'RECHAZADA',
      motivoRechazo: 'No hay plazas disponibles',
      responsableId: COORDINADOR_ID,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: { motivo: 'No hay plazas disponibles' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().solicitud.estado).toBe('RECHAZADA')
    expect(mp.solicitudParticipacionPuesto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'RECHAZADA',
          motivoRechazo: 'No hay plazas disponibles',
          responsableId: COORDINADOR_ID,
        }),
      }),
    )
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'RECHAZAR_PARTICIPACION_PUESTO' }) }),
    )
    await app.close()
  })

  it('exige un motivo para rechazar una incorporacion', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'PENDIENTE' })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().message).toMatch(/motivo/i)
    expect(mp.solicitudParticipacionPuesto.update).not.toHaveBeenCalled()
    await app.close()
  })

  it('bloquea con 400 si la solicitud ya esta revisada', async () => {
    const app = await buildTestApp()
    mp.solicitudParticipacionPuesto.findUnique.mockResolvedValue({ estado: 'RECHAZADA' })

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/rechazar`,
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
      url: '/api/puestos/coordinador/participaciones/solicitud-inexistente/rechazar',
      payload: {},
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('devuelve 403 si el usuario no tiene rol COORDINADOR', async () => {
    const app = await buildTestApp()
    mockAuthUser.roles = ['VOLUNTARIO']

    const response = await app.inject({
      method: 'POST',
      url: `/api/puestos/coordinador/participaciones/${SOLICITUD_ID}/rechazar`,
      payload: {},
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})
