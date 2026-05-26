// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => {
  const prisma = {
    usuario: { findUnique: vi.fn() },
    voluntario: { findUnique: vi.fn(), create: vi.fn() },
    donacion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    inventario: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma))
  return { prisma }
})

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  listNecesidadesDonacion,
  createDonacion,
  listMisDonaciones,
  updateDonacionEstado,
  generarCodigoEntrega,
} from '../../../backend/src/modules/donaciones/donaciones.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PUESTO_ID  = 'puesto-1'
const PRODUCTO_ID = 'producto-1'
const USUARIO_ID  = 'usuario-1'
const VOLUNTARIO_ID = 'voluntario-1'
const DONACION_ID = 'donacion-1'

const productoBase = { id: PRODUCTO_ID, nombre: 'Agua mineral', categoria: 'Alimentacion', unidad: 'litros' }
const puestoBase   = {
  id: PUESTO_ID, nombre: 'Puesto Valencia Norte', direccion: 'Calle Mayor 1',
  latitud: 39.47, longitud: -0.37, tipo: 'DISTRIBUCION', activo: true, catastrofeId: 'cat-1',
}

// ── listNecesidadesDonacion ───────────────────────────────────────────────────

describe('listNecesidadesDonacion', () => {
  beforeEach(() => vi.resetAllMocks())

  it('devuelve necesidades con cantidadPendiente correcta tras restar comprometidas', async () => {
    mp.inventario.findMany.mockResolvedValue([
      { id: 'inv-1', puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 10, producto: productoBase, puesto: puestoBase, updatedAt: new Date() },
    ])
    mp.donacion.groupBy.mockResolvedValue([
      { puestoId: PUESTO_ID, productoId: PRODUCTO_ID, _sum: { cantidad: 3 } },
    ])

    const result = await listNecesidadesDonacion()

    expect(result).toHaveLength(1)
    expect(result[0].cantidadPendiente).toBe(7)
    expect(result[0].cantidadComprometida).toBe(3)
  })

  it('asigna prioridad alta cuando queda mas del 30% pendiente', async () => {
    mp.inventario.findMany.mockResolvedValue([
      { id: 'inv-1', puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 10, producto: productoBase, puesto: puestoBase, updatedAt: new Date() },
    ])
    mp.donacion.groupBy.mockResolvedValue([])

    const result = await listNecesidadesDonacion()

    expect(result[0].prioridad).toBe('alta')
  })

  it('asigna prioridad baja cuando queda menos del 30% pendiente', async () => {
    mp.inventario.findMany.mockResolvedValue([
      { id: 'inv-1', puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 10, producto: productoBase, puesto: puestoBase, updatedAt: new Date() },
    ])
    // Quedan 2 de 10 => 20%, menor al umbral del 30%
    mp.donacion.groupBy.mockResolvedValue([
      { puestoId: PUESTO_ID, productoId: PRODUCTO_ID, _sum: { cantidad: 8 } },
    ])

    const result = await listNecesidadesDonacion()

    expect(result[0].prioridad).toBe('baja')
  })

  it('filtra completamente las necesidades ya cubiertas por donaciones en camino', async () => {
    mp.inventario.findMany.mockResolvedValue([
      { id: 'inv-1', puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 10, producto: productoBase, puesto: puestoBase, updatedAt: new Date() },
    ])
    mp.donacion.groupBy.mockResolvedValue([
      { puestoId: PUESTO_ID, productoId: PRODUCTO_ID, _sum: { cantidad: 10 } },
    ])

    const result = await listNecesidadesDonacion()

    expect(result).toHaveLength(0)
  })

  it('un voluntario puede tener donaciones activas hacia varios puestos distintos', async () => {
    const PUESTO_2 = 'puesto-2'
    mp.inventario.findMany.mockResolvedValue([
      { id: 'inv-1', puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 10, producto: productoBase, puesto: puestoBase, updatedAt: new Date() },
      { id: 'inv-2', puestoId: PUESTO_2,  productoId: PRODUCTO_ID, cantidad: 5,  producto: productoBase, puesto: { ...puestoBase, id: PUESTO_2 }, updatedAt: new Date() },
    ])
    mp.donacion.groupBy.mockResolvedValue([])

    const result = await listNecesidadesDonacion()

    // Ambas necesidades deben aparecer; el backend no limita por voluntario
    expect(result).toHaveLength(2)
  })
})

// ── createDonacion ────────────────────────────────────────────────────────────

describe('createDonacion', () => {
  const input = { puestoId: PUESTO_ID, productoId: PRODUCTO_ID, cantidad: 5, unidad: 'litros' }

  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(mp))
  })

  it('crea la donacion cuando hay necesidad pendiente suficiente', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue({ cantidad: 10, producto: productoBase, puesto: puestoBase })
    mp.donacion.aggregate.mockResolvedValue({ _sum: { cantidad: 0 } })
    mp.donacion.create.mockResolvedValue({
      id: DONACION_ID, voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID,
      estado: 'PENDIENTE', producto: productoBase, puesto: puestoBase,
    })

    const result = await createDonacion(USUARIO_ID, input)

    expect(result.id).toBe(DONACION_ID)
    expect(result.estado).toBe('PENDIENTE')
    expect(mp.donacion.create).toHaveBeenCalledOnce()
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO'] })

    await expect(createDonacion(USUARIO_ID, input)).rejects.toMatchObject({
      statusCode: 400,
      message: 'El usuario no tiene perfil de voluntario',
    })
    expect(mp.donacion.create).not.toHaveBeenCalled()
  })

  it('crea el perfil operativo si el usuario tiene rol voluntario pero aun no tiene fila Voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO', 'VOLUNTARIO'] })
    mp.voluntario.create.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue({ cantidad: 10, producto: productoBase, puesto: puestoBase })
    mp.donacion.aggregate.mockResolvedValue({ _sum: { cantidad: 0 } })
    mp.donacion.create.mockResolvedValue({
      id: DONACION_ID, voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID,
      estado: 'PENDIENTE', producto: productoBase, puesto: puestoBase,
    })

    await createDonacion(USUARIO_ID, input)

    expect(mp.voluntario.create).toHaveBeenCalledWith({
      data: { usuarioId: USUARIO_ID },
      select: { id: true },
    })
    expect(mp.donacion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ voluntarioId: VOLUNTARIO_ID }),
    }))
  })

  it('lanza 404 si no existe necesidad para ese puesto y producto', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue(null)

    await expect(createDonacion(USUARIO_ID, input)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lanza 400 si la necesidad ya esta cubierta por otras donaciones en camino', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue({ cantidad: 10, producto: productoBase, puesto: puestoBase })
    mp.donacion.aggregate.mockResolvedValue({ _sum: { cantidad: 10 } })

    await expect(createDonacion(USUARIO_ID, input)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Esta necesidad ya esta cubierta por otras donaciones en camino',
    })
  })

  it('lanza 400 si la cantidad pedida supera lo que queda pendiente', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue({ cantidad: 10, producto: productoBase, puesto: puestoBase })
    mp.donacion.aggregate.mockResolvedValue({ _sum: { cantidad: 8 } }) // quedan 2

    await expect(createDonacion(USUARIO_ID, { ...input, cantidad: 5 })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(mp.donacion.create).not.toHaveBeenCalled()
  })

  it('reintenta una colision concurrente y no reserva mas de la necesidad', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.inventario.findFirst.mockResolvedValue({ cantidad: 10, producto: productoBase, puesto: puestoBase })
    mp.donacion.aggregate
      .mockResolvedValueOnce({ _sum: { cantidad: 0 } })
      .mockResolvedValueOnce({ _sum: { cantidad: 10 } })
    mp.donacion.create.mockResolvedValue({
      id: DONACION_ID, voluntarioId: VOLUNTARIO_ID, puestoId: PUESTO_ID,
      estado: 'PENDIENTE', producto: productoBase, puesto: puestoBase,
    })
    let transactionAttempt = 0
    mp.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      transactionAttempt += 1
      if (transactionAttempt === 2) throw { code: 'P2034' }
      return callback(mp)
    })

    const reservations = await Promise.allSettled([
      createDonacion('usuario-primero', { ...input, cantidad: 10 }),
      createDonacion('usuario-segundo', { ...input, cantidad: 10 }),
    ])

    expect(reservations.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(reservations.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(mp.donacion.create).toHaveBeenCalledOnce()
    expect(mp.$transaction).toHaveBeenCalledTimes(3)
  })
})

// ── listMisDonaciones ─────────────────────────────────────────────────────────

describe('listMisDonaciones', () => {
  beforeEach(() => vi.resetAllMocks())

  it('devuelve las donaciones del voluntario con producto y puesto incluidos', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findMany.mockResolvedValue([
      { id: 'don-1', estado: 'PENDIENTE', producto: productoBase, puesto: puestoBase },
      { id: 'don-2', estado: 'EN_CAMINO', producto: productoBase, puesto: puestoBase },
    ])

    const result = await listMisDonaciones(USUARIO_ID)

    expect(result).toHaveLength(2)
    expect(mp.donacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { voluntarioId: VOLUNTARIO_ID } }),
    )
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(listMisDonaciones(USUARIO_ID)).rejects.toMatchObject({ statusCode: 400 })
  })
})

// ── updateDonacionEstado ──────────────────────────────────────────────────────

describe('updateDonacionEstado', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(mp))
  })

  it('actualiza el estado de la donacion propia exitosamente', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({ id: DONACION_ID, estado: 'PENDIENTE', puestoId: PUESTO_ID })
    mp.donacion.update.mockResolvedValue({ id: DONACION_ID, estado: 'EN_CAMINO', producto: productoBase, puesto: puestoBase })

    const result = await updateDonacionEstado(USUARIO_ID, DONACION_ID, 'EN_CAMINO')

    expect(result.estado).toBe('EN_CAMINO')
    expect(mp.donacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DONACION_ID }, data: { estado: 'EN_CAMINO' } }),
    )
  })

  it('lanza 404 si la donacion no pertenece al voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)

    await expect(updateDonacionEstado(USUARIO_ID, DONACION_ID, 'CANCELADA')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(mp.donacion.update).not.toHaveBeenCalled()
  })
})

// ── generarCodigoEntrega ──────────────────────────────────────────────────────

describe('generarCodigoEntrega', () => {
  beforeEach(() => vi.resetAllMocks())

  it('genera un codigo QR de entrega cuando la donacion esta EN_CAMINO', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID, estado: 'EN_CAMINO', entregaCodigo: null,
      producto: productoBase, puesto: puestoBase,
    })
    mp.donacion.update.mockResolvedValue({
      id: DONACION_ID, estado: 'EN_CAMINO', entregaCodigo: 'DEL-abc-123',
      producto: productoBase, puesto: puestoBase,
    })

    const result = await generarCodigoEntrega(USUARIO_ID, DONACION_ID)

    expect(result.entregaCodigo).toBe('DEL-abc-123')
    expect(mp.donacion.update).toHaveBeenCalledOnce()
  })

  it('retorna la donacion sin cambios si el codigo ya fue generado (idempotente)', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID, estado: 'EN_CAMINO', entregaCodigo: 'DEL-ya-existe',
      producto: productoBase, puesto: puestoBase,
    })

    const result = await generarCodigoEntrega(USUARIO_ID, DONACION_ID)

    expect(result.entregaCodigo).toBe('DEL-ya-existe')
    expect(mp.donacion.update).not.toHaveBeenCalled()
  })

  it('lanza 400 si la donacion no esta EN_CAMINO', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID, estado: 'PENDIENTE', entregaCodigo: null,
      producto: productoBase, puesto: puestoBase,
    })

    await expect(generarCodigoEntrega(USUARIO_ID, DONACION_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Solo puedes generar el codigo cuando la donacion esta en camino',
    })
  })

  it('lanza 404 si la donacion no existe o no es del voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)

    await expect(generarCodigoEntrega(USUARIO_ID, 'don-inexistente')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
