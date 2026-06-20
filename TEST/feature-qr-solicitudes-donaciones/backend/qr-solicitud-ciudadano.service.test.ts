import { describe, it, expect, vi, beforeEach } from 'vitest'

const { appendChainEvent } = vi.hoisted(() => ({ appendChainEvent: vi.fn() }))

vi.mock('../../../backend/src/lib/chain.js', () => ({ appendChainEvent }))

vi.mock('../../../backend/src/lib/prisma.js', () => {
  const prisma = {
    puestoEmergencia: { findUnique: vi.fn() },
    inventario: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    donacion: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    qrConsumption: { create: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((callback) => callback(prisma)),
  }
  return { prisma }
})

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  confirmarQrInventario,
  getEstadoSolicitudQr,
} from '../../../backend/src/modules/inventario/inventario.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUESTO_ID = 'puesto-qr-1'
const USER_ID = 'user-qr-1'
const PRODUCTO = { id: 'prod-agua', nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' }

const ITEM_DISPONIBLE = {
  id: 'inv-agua',
  puestoId: PUESTO_ID,
  productoId: PRODUCTO.id,
  tipo: 'DISPONIBLE',
  cantidad: 20,
  producto: PRODUCTO,
}

function allowAccess() {
  mp.puestoEmergencia.findUnique.mockResolvedValue({
    adminId: USER_ID,
    trabajadores: [],
    asignacionesVoluntarios: [],
  })
}

function codigoSCCompacto(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    t: 'SC',
    r: 'req-abc',
    p: PUESTO_ID,
    i: [{ n: 'Agua embotellada', c: 'Bebidas', q: 5, u: 'litros' }],
    ...overrides,
  })
}

// ── confirmarQrInventario — solicitud ciudadana ────────────────────────────────

describe('confirmarQrInventario — solicitud ciudadana (SC)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation(
      (callback: unknown) => (callback as (tx: unknown) => unknown)(mp),
    )
  })

  it('descuenta el inventario disponible al confirmar un QR de solicitud válido', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow.mockResolvedValue({ ...ITEM_DISPONIBLE, cantidad: 15 })

    const result = await confirmarQrInventario(
      PUESTO_ID,
      { codigo: codigoSCCompacto() },
      USER_ID,
    )

    expect(result.tipo).toBe('SOLICITUD_CIUDADANO')
    expect(mp.inventario.updateMany).toHaveBeenCalledWith({
      where: { id: ITEM_DISPONIBLE.id, cantidad: { gte: 5 } },
      data: { cantidad: { decrement: 5 } },
    })
    expect(appendChainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'INVENTARIO_SALIDA',
        payload: expect.objectContaining({ cantidadSalida: 5 }),
      }),
    )
  })

  it('registra auditoria de uso único con el requestId del QR', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow.mockResolvedValue({ ...ITEM_DISPONIBLE, cantidad: 15 })

    await confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto() }, USER_ID)

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
          entidad: 'QR_SOLICITUD_CIUDADANO',
          entidadId: 'req-abc',
        }),
      }),
    )
  })

  it('acepta el formato completo legacy (type: SOLICITUD_CIUDADANO)', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow.mockResolvedValue({ ...ITEM_DISPONIBLE, cantidad: 18 })

    const codigoLegacy = JSON.stringify({
      type: 'SOLICITUD_CIUDADANO',
      requestId: 'req-legacy',
      puestoId: PUESTO_ID,
      productos: [{ nombre: 'Agua embotellada', categoria: 'Bebidas', cantidad: 2, unidad: 'litros' }],
    })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo: codigoLegacy }, USER_ID)

    expect(result.tipo).toBe('SOLICITUD_CIUDADANO')
    expect(mp.inventario.updateMany).toHaveBeenCalled()
  })

  it('rechaza un QR destinado a otro puesto antes de tocar inventario', async () => {
    allowAccess()

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto({ p: 'otro-puesto' }) }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Este QR pertenece a otro puesto' })

    expect(mp.inventario.findMany).not.toHaveBeenCalled()
  })

  it('rechaza (409) un QR de solicitud ya escaneado anteriormente', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue({ id: 'audit-existente' })

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto() }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Este QR de solicitud ya se ha usado. Pide al ciudadano que genere uno nuevo.',
    })

    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('solo procesa una de dos confirmaciones simultaneas del mismo QR', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.qrConsumption.create
      .mockResolvedValueOnce({ key: 'SOLICITUD_CIUDADANO:req-abc' })
      .mockRejectedValueOnce({ code: 'P2002' })
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow.mockResolvedValue({ ...ITEM_DISPONIBLE, cantidad: 15 })

    const confirmations = await Promise.allSettled([
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto() }, USER_ID),
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto() }, USER_ID),
    ])

    expect(confirmations.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(confirmations.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(mp.inventario.updateMany).toHaveBeenCalledOnce()
  })

  it('rechaza un QR de solicitud antiguo que no tiene código de un solo uso', async () => {
    allowAccess()
    const codigoSinRequestId = JSON.stringify({
      t: 'SC',
      p: PUESTO_ID,
      i: [{ n: 'Agua embotellada', q: 3, u: 'litros' }],
    })

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSinRequestId }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Este QR de solicitud es antiguo y no tiene código de un solo uso. Genera un QR nuevo.',
    })
  })

  it('rechaza un QR con JSON invalido', async () => {
    allowAccess()

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: 'no-es-json!!!' }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400, message: 'El QR no tiene un formato válido' })
  })

  it('rechaza un QR con JSON válido pero formato desconocido', async () => {
    allowAccess()

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: JSON.stringify({ foo: 'bar' }) }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Formato de QR no reconocido' })
  })

  it('rechaza una solicitud cuyo único producto tiene cantidad 0', async () => {
    allowAccess()
    const codigoCantidadCero = JSON.stringify({
      t: 'SC',
      r: 'req-sin-productos',
      p: PUESTO_ID,
      i: [{ n: 'Agua embotellada', q: 0, u: 'litros' }],
    })

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoCantidadCero }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400, message: 'El QR no incluye productos válidos' })
  })

  it('informa con 404 si el producto del QR no existe en inventario disponible', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([]) // inventario vacio

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSCCompacto() }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'No encuentro "Agua embotellada" en el inventario disponible',
    })

    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('informa con 400 si el stock disponible es menor a la cantidad pedida', async () => {
    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([{ ...ITEM_DISPONIBLE, cantidad: 3 }])

    const codigoExceso = JSON.stringify({
      t: 'SC',
      r: 'req-exceso',
      p: PUESTO_ID,
      i: [{ n: 'Agua embotellada', c: 'Bebidas', q: 5, u: 'litros' }],
    })

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoExceso }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Stock insuficiente de Agua embotellada. Disponible: 3 litros',
    })
  })

  it('procesa correctamente un QR con varios productos distintos', async () => {
    const ITEM_MANTAS = {
      id: 'inv-mantas',
      puestoId: PUESTO_ID,
      productoId: 'prod-mantas',
      tipo: 'DISPONIBLE',
      cantidad: 10,
      producto: { id: 'prod-mantas', nombre: 'Mantas', categoria: 'Abrigo', unidad: 'unidades' },
    }

    allowAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE, ITEM_MANTAS])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow
      .mockResolvedValueOnce({ ...ITEM_DISPONIBLE, cantidad: 18 })
      .mockResolvedValueOnce({ ...ITEM_MANTAS, cantidad: 7 })

    const codigoMultiple = JSON.stringify({
      t: 'SC',
      r: 'req-multi',
      p: PUESTO_ID,
      i: [
        { n: 'Agua embotellada', c: 'Bebidas', q: 2, u: 'litros' },
        { n: 'Mantas', c: 'Abrigo', q: 3, u: 'unidades' },
      ],
    })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo: codigoMultiple }, USER_ID)

    expect(result.tipo).toBe('SOLICITUD_CIUDADANO')
    expect(mp.inventario.updateMany).toHaveBeenCalledTimes(2)
  })
})

// ── getEstadoSolicitudQr ──────────────────────────────────────────────────────

describe('getEstadoSolicitudQr', () => {
  beforeEach(() => vi.resetAllMocks())

  it('devuelve PENDIENTE si la solicitud aun no se ha confirmado en ningun puesto', async () => {
    mp.auditLog.findFirst.mockResolvedValue(null)

    const result = await getEstadoSolicitudQr('req-pendiente')

    expect(result).toEqual({ estado: 'PENDIENTE' })
  })

  it('devuelve COMPLETADA con timestamp cuando ya fue confirmada', async () => {
    const completedAt = new Date('2026-05-19T09:00:00.000Z')
    mp.auditLog.findFirst.mockResolvedValue({ createdAt: completedAt })

    const result = await getEstadoSolicitudQr('req-completada')

    expect(result).toEqual({ estado: 'COMPLETADA', completedAt })
  })

  it('busca el auditLog con la accion y entidad correctas', async () => {
    mp.auditLog.findFirst.mockResolvedValue(null)

    await getEstadoSolicitudQr('req-test')

    expect(mp.auditLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
          entidad: 'QR_SOLICITUD_CIUDADANO',
          entidadId: 'req-test',
        }),
      }),
    )
  })
})
