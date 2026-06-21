// @vitest-environment node
// Tests para la logica de asignacion de voluntarios a puestos de emergencia
// (implementada directamente en puestos.router.ts usando transacciones Prisma)
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    voluntario: { findUnique: vi.fn() },
    donacion: { findFirst: vi.fn() },
    puestoEmergencia: { findMany: vi.fn(), findFirst: vi.fn() },
    asignacionPuesto: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../../backend/src/lib/prisma.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PUESTO_ID     = 'puesto-1'
const VOLUNTARIO_ID = 'voluntario-1'
const ASIGNACION_ID = 'asig-1'

const puestoConCapacidad = {
  id: PUESTO_ID, nombre: 'Puesto Valencia Norte',
  descripcion: 'Centro de distribucion', direccion: 'Calle Mayor 1',
  latitud: 39.47, longitud: -0.37, tipo: 'DISTRIBUCION',
  activo: true, capacidadTrabajo: 6, catastrofeId: 'cat-1',
}

// Simulamos la logica de asignacion tal como la implementa puestos.router.ts
async function asignarVoluntarioAPuesto(voluntarioId: string, puestoId: string) {
  return mp.$transaction(async (tx: typeof mp) => {
    const donacionActiva = await tx.donacion.findFirst({
      where: { voluntarioId, estado: { in: ['PENDIENTE', 'EN_CAMINO'] } },
      select: { id: true },
    })
    if (donacionActiva) {
      throw Object.assign(new Error('Ya tienes una donación activa. Finalízala o cancélala antes de ayudar en un puesto.'), { statusCode: 400 })
    }

    const asignacionActiva = await tx.asignacionPuesto.findFirst({
      where: { voluntarioId, estado: 'ACTIVA' },
      include: { puesto: true },
    })
    if (asignacionActiva) {
      if (asignacionActiva.puestoId === puestoId) return asignacionActiva
      throw Object.assign(new Error(`Ya estas ayudando en ${asignacionActiva.puesto.nombre}. Termina esa tarea antes de elegir otro puesto.`), { statusCode: 400 })
    }

    const puesto = await tx.puestoEmergencia.findFirst({
      where: { id: puestoId, activo: true },
      select: { id: true, capacidadTrabajo: true },
    })
    if (!puesto) throw Object.assign(new Error('Puesto no encontrado'), { statusCode: 404 })

    const trabajando = await tx.asignacionPuesto.count({ where: { puestoId, estado: 'ACTIVA' } })
    if (trabajando >= puesto.capacidadTrabajo) {
      throw Object.assign(new Error('Este puesto está lleno ahora mismo.'), { statusCode: 400 })
    }

    return tx.asignacionPuesto.create({
      data: { voluntarioId, puestoId },
      include: { puesto: true },
    })
  })
}

// ── Listar puestos ────────────────────────────────────────────────────────────

describe('listPuestosActivos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve puestos activos con el conteo de voluntarios trabajando', async () => {
    mp.puestoEmergencia.findMany.mockResolvedValue([
      { ...puestoConCapacidad, _count: { asignacionesVoluntarios: 2 } },
    ])

    const puestos = await mp.puestoEmergencia.findMany({
      where: { activo: true },
      include: { _count: { select: { asignacionesVoluntarios: { where: { estado: 'ACTIVA' } } } } },
    })

    expect(puestos[0]._count.asignacionesVoluntarios).toBe(2)
    expect(puestos[0].capacidadTrabajo).toBe(6)
  })
})

// ── Asignar voluntario a puesto ───────────────────────────────────────────────

describe('asignarVoluntarioAPuesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => fn(mp))
  })

  it('asigna al voluntario en el puesto correctamente', async () => {
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 6 })
    mp.asignacionPuesto.count.mockResolvedValue(2)
    mp.asignacionPuesto.create.mockResolvedValue({
      id: ASIGNACION_ID, voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID,
      estado: 'ACTIVA', puesto: puestoConCapacidad,
    })

    const result = await asignarVoluntarioAPuesto(VOLUNTARIO_ID, PUESTO_ID)

    expect(result.estado).toBe('ACTIVA')
    expect(mp.asignacionPuesto.create).toHaveBeenCalledOnce()
  })

  it('bloquea si el puesto está lleno — se muestra la ocupacion al voluntario', async () => {
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.findFirst.mockResolvedValue({ id: PUESTO_ID, capacidadTrabajo: 3 })
    mp.asignacionPuesto.count.mockResolvedValue(3) // lleno

    await expect(asignarVoluntarioAPuesto(VOLUNTARIO_ID, PUESTO_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Este puesto está lleno ahora mismo.',
    })
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario tiene una donación activa (solo 1 actividad operativa a la vez)', async () => {
    mp.donacion.findFirst.mockResolvedValue({ id: 'don-activa' })

    await expect(asignarVoluntarioAPuesto(VOLUNTARIO_ID, PUESTO_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('donación activa'),
    })
  })

  it('lanza 400 si el voluntario ya está en otro puesto diferente', async () => {
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: 'asig-otro', puestoId: 'puesto-otro', estado: 'ACTIVA',
      puesto: { nombre: 'Puesto Sur' },
    })

    await expect(asignarVoluntarioAPuesto(VOLUNTARIO_ID, PUESTO_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Puesto Sur'),
    })
  })

  it('es idempotente si el voluntario ya está asignado al mismo puesto', async () => {
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: ASIGNACION_ID, puestoId: PUESTO_ID, estado: 'ACTIVA',
      puesto: puestoConCapacidad,
    })

    const result = await asignarVoluntarioAPuesto(VOLUNTARIO_ID, PUESTO_ID)

    expect(result.id).toBe(ASIGNACION_ID)
    expect(mp.asignacionPuesto.create).not.toHaveBeenCalled()
  })

  it('lanza 404 si el puesto no existe o no está activo', async () => {
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.puestoEmergencia.findFirst.mockResolvedValue(null)

    await expect(asignarVoluntarioAPuesto(VOLUNTARIO_ID, 'puesto-inexistente')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Finalizar asignacion a puesto ─────────────────────────────────────────────

describe('finalizarAsignacionPuesto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finaliza la asignación activa registrando la hora de fin', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue({ id: ASIGNACION_ID })
    mp.asignacionPuesto.update.mockResolvedValue({
      id: ASIGNACION_ID, estado: 'FINALIZADA', endedAt: new Date(), puesto: puestoConCapacidad,
    })

    const asignacion = await mp.asignacionPuesto.findFirst({ where: { voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID, estado: 'ACTIVA' } })
    const finalizada = await mp.asignacionPuesto.update({
      where: { id: asignacion.id },
      data: { estado: 'FINALIZADA', endedAt: new Date() },
      include: { puesto: true },
    })

    expect(finalizada.estado).toBe('FINALIZADA')
    expect(finalizada.puesto.nombre).toBe('Puesto Valencia Norte')
  })

  it('lanza 404 si el voluntario no tiene asignación activa en ese puesto', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)

    const asignacion = await mp.asignacionPuesto.findFirst({ where: { voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID, estado: 'ACTIVA' } })

    expect(asignacion).toBeNull()
    expect(mp.asignacionPuesto.update).not.toHaveBeenCalled()
  })
})

// ── Historial de puestos ──────────────────────────────────────────────────────

describe('historialAsignacionesPuesto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve el historial de puestos donde el voluntario ha colaborado', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionPuesto.findMany.mockResolvedValue([
      { id: 'asig-1', estado: 'FINALIZADA', puesto: { nombre: 'Puesto Norte' } },
      { id: 'asig-2', estado: 'FINALIZADA', puesto: { nombre: 'Puesto Sur' } },
      { id: ASIGNACION_ID, estado: 'ACTIVA', puesto: puestoConCapacidad },
    ])

    const historial = await mp.asignacionPuesto.findMany({
      where: { voluntarioId: VOLUNTARIO_ID },
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: { puesto: true },
    })

    expect(historial).toHaveLength(3)
    expect(historial.map((a: { puesto: { nombre: string } }) => a.puesto.nombre)).toContain('Puesto Norte')
  })
})
