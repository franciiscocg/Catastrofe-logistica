// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    incidenciaVia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    comentarioIncidenciaVia: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  createIncidencia,
  listIncidencias,
  updateIncidenciaEstado,
  updateIncidenciaByCoordinator,
  createComentarioIncidencia,
} from '../../../backend/src/modules/incidencias/incidencias.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUNTO_PAIPORTA = { latitud: 39.4254, longitud: -0.4178 }
const PUNTO_FUERA = { latitud: 0, longitud: 0 }

describe('createIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea incidencia sin asociarla a una catastrofe', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({
      id: 'inc-1',
      ...PUNTO_PAIPORTA,
      estado: 'CORTADA',
      descripcion: 'Calle inundada',
    })

    const result = await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', descripcion: 'Calle inundada' })

    expect(result.estado).toBe('CORTADA')
    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
    const createArgs = mp.incidenciaVia.create.mock.calls[0][0]
    expect(Object.hasOwn(createArgs.data, 'catastrofe' + 'Id')).toBe(false)
  })

  it('crea incidencia sin resolver ninguna catastrofe activa por ubicación', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({ id: 'inc-fuera', ...PUNTO_FUERA, estado: 'CORTADA' })

    await createIncidencia({ ...PUNTO_FUERA, estado: 'CORTADA' })

    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
  })

  it('lanza error 409 si hay incidencia similar a menos de 50m en las ultimas 2h', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([{
      id: 'inc-existing',
      latitud: PUNTO_PAIPORTA.latitud,
      longitud: PUNTO_PAIPORTA.longitud + 0.0001,
      estado: 'CORTADA',
      descripcion: null,
      createdAt: new Date(),
    }])

    await expect(
      createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA' }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Ya existe una incidencia similar') })
  })

  it('con force=true omite la comprobacion de duplicados', async () => {
    mp.incidenciaVia.create.mockResolvedValue({ id: 'inc-forzada', ...PUNTO_PAIPORTA, estado: 'CORTADA' })

    await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', force: true })

    expect(mp.incidenciaVia.findMany).not.toHaveBeenCalled()
    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
  })
})

describe('listIncidencias', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve todas las incidencias', async () => {
    const incidencias = [
      { id: '1', estado: 'CORTADA', comentarios: [], _count: { comentarios: 0 } },
      { id: '2', estado: 'TRANSITABLE', comentarios: [], _count: { comentarios: 0 } },
    ]
    mp.incidenciaVia.findMany.mockResolvedValue(incidencias)

    const result = await listIncidencias({})

    expect(result).toHaveLength(2)
    const select = mp.incidenciaVia.findMany.mock.calls[0][0].select
    expect(select).not.toHaveProperty('reportanteId')
    expect(select).not.toHaveProperty('reportante')
    expect(select.comentarios.select).not.toHaveProperty('autorId')
    expect(select.comentarios.select).not.toHaveProperty('autor')
  })

  it('filtra por estado cuando se especifica', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])

    await listIncidencias({ estado: 'CORTADA' })

    expect(mp.incidenciaVia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'CORTADA' } }),
    )
  })

  it('devuelve lista vacia si no hay incidencias', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])
    expect(await listIncidencias({})).toEqual([])
  })
})

describe('updateIncidenciaEstado', () => {
  beforeEach(() => vi.clearAllMocks())

  it('actualiza el estado de una incidencia existente', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: 'inc-1' })
    const updateMany = vi.fn().mockResolvedValue({ count: 2 })
    const update = vi.fn().mockResolvedValue({ id: 'inc-1', estado: 'TRANSITABLE' })
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      incidenciaVia: { update },
      asignacionIncidencia: { updateMany },
    }))

    const result = await updateIncidenciaEstado('inc-1', { estado: 'TRANSITABLE' })

    expect(result.estado).toBe('TRANSITABLE')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inc-1' }, data: { estado: 'TRANSITABLE' } }),
    )
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { incidenciaId: 'inc-1', estado: 'ACTIVA' },
      data: expect.objectContaining({ estado: 'FINALIZADA', endedAt: expect.any(Date) }),
    }))
  })

  it('lanza error 404 para incidencia inexistente', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    await expect(
      updateIncidenciaEstado('no-existe', { estado: 'TRANSITABLE' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('updateIncidenciaByCoordinator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finaliza voluntarios activos cuando el coordinador marca la incidencia como transitable', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: 'inc-1', estado: 'CORTADA' })
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    mp.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      incidenciaVia: { update: vi.fn().mockResolvedValue({ id: 'inc-1', estado: 'TRANSITABLE' }) },
      asignacionIncidencia: { updateMany },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }))

    await updateIncidenciaByCoordinator('inc-1', { estado: 'TRANSITABLE' }, 'coord-1')

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { incidenciaId: 'inc-1', estado: 'ACTIVA' },
      data: expect.objectContaining({ estado: 'FINALIZADA', endedAt: expect.any(Date) }),
    }))
  })
})

describe('createComentarioIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea comentario y actualiza estado en una transaccion', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: 'inc-1' })

    const comentarioCreado = { id: 'com-1', incidenciaId: 'inc-1', estado: 'TRANSITABLE', comentario: 'Calle despejada', autor: null }
    const incidenciaActualizada = { id: 'inc-1', estado: 'TRANSITABLE' }

    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => {
      const tx = {
        comentarioIncidenciaVia: { create: vi.fn().mockResolvedValue(comentarioCreado) },
        incidenciaVia: { update: vi.fn().mockResolvedValue(incidenciaActualizada) },
        asignacionIncidencia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return fn(tx)
    })

    const result = await createComentarioIncidencia('inc-1', { estado: 'TRANSITABLE', comentario: 'Calle despejada' })

    expect(result.comentario.estado).toBe('TRANSITABLE')
    expect(result.incidencia.estado).toBe('TRANSITABLE')

    const transaction = mp.$transaction.mock.calls[0][0]
    const tx = {
      comentarioIncidenciaVia: { create: vi.fn().mockResolvedValue(comentarioCreado) },
      incidenciaVia: { update: vi.fn().mockResolvedValue(incidenciaActualizada) },
      asignacionIncidencia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    await transaction(tx)
    const select = tx.comentarioIncidenciaVia.create.mock.calls[0][0].select
    expect(select).not.toHaveProperty('autorId')
    expect(select).not.toHaveProperty('autor')
    expect(tx.asignacionIncidencia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { incidenciaId: 'inc-1', estado: 'ACTIVA' },
      data: expect.objectContaining({ estado: 'FINALIZADA', endedAt: expect.any(Date) }),
    }))
  })

  it('lanza error 404 si la incidencia no existe', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    await expect(
      createComentarioIncidencia('no-existe', { estado: 'CORTADA', comentario: 'test' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
