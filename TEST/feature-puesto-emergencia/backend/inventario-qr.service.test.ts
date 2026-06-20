import { describe, it, expect, vi, beforeEach } from 'vitest'

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
      updateMany: vi.fn(),
    },
    qrConsumption: { create: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((callback) => callback(prisma)),
  }
  return { prisma }
})

import { prisma } from '../../../backend/src/lib/prisma.js'
import { confirmarQrInventario, getEstadoSolicitudQr } from '../../../backend/src/modules/inventario/inventario.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUESTO_ID = 'puesto-1'
const USER_ID = 'user-1'
const PRODUCTO = { id: 'prod-1', nombre: 'Agua', categoria: 'Bebidas', unidad: 'litros' }
const ITEM_DISPONIBLE = {
  id: 'inv-1',
  puestoId: PUESTO_ID,
  productoId: PRODUCTO.id,
  tipo: 'DISPONIBLE',
  cantidad: 10,
  producto: PRODUCTO,
}

function allowPuestoAccess() {
  mp.puestoEmergencia.findUnique.mockResolvedValue({
    adminId: USER_ID,
    trabajadores: [],
    asignacionesVoluntarios: [],
  })
}

describe('confirmarQrInventario', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation((callback: unknown) => (callback as (tx: unknown) => unknown)(mp))
    mp.donacion.updateMany.mockResolvedValue({ count: 1 })
  })

  it('descuenta inventario al confirmar una solicitud ciudadana válida', async () => {
    allowPuestoAccess()
    mp.inventario.findMany.mockResolvedValue([ITEM_DISPONIBLE])
    mp.inventario.updateMany.mockResolvedValue({ count: 1 })
    mp.inventario.findUniqueOrThrow.mockResolvedValue({ ...ITEM_DISPONIBLE, cantidad: 7 })
    mp.auditLog.findFirst.mockResolvedValue(null)

    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-1',
      p: PUESTO_ID,
      i: [{ n: 'Agua', c: 'Bebidas', q: 3, u: 'litros' }],
    })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID)

    expect(result.tipo).toBe('SOLICITUD_CIUDADANO')
    expect(mp.inventario.updateMany).toHaveBeenCalledWith({
      where: { id: ITEM_DISPONIBLE.id, cantidad: { gte: 3 } },
      data: { cantidad: { decrement: 3 } },
    })
    expect(mp.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA' }),
    }))
    expect(mp.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entidad: 'QR_SOLICITUD_CIUDADANO',
        entidadId: 'sol-1',
      }),
    }))
  })

  it('rechaza solicitudes de otro puesto antes de tocar inventario', async () => {
    allowPuestoAccess()
    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-otro',
      p: 'otro-puesto',
      i: [{ n: 'Agua', q: 1, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({ statusCode: 400, message: 'Este QR pertenece a otro puesto' })
    expect(mp.inventario.findMany).not.toHaveBeenCalled()
  })

  it('rechaza una solicitud ciudadana ya usada', async () => {
    allowPuestoAccess()
    mp.auditLog.findFirst.mockResolvedValue({ id: 'audit-1' })

    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-usada',
      p: PUESTO_ID,
      i: [{ n: 'Agua', q: 1, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 409,
        message: 'Este QR de solicitud ya se ha usado. Pide al ciudadano que genere uno nuevo.',
      })
    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('rechaza solicitudes ciudadanas antiguas sin código de un solo uso', async () => {
    allowPuestoAccess()

    const codigo = JSON.stringify({
      t: 'SC',
      p: PUESTO_ID,
      i: [{ n: 'Agua', q: 1, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'Este QR de solicitud es antiguo y no tiene código de un solo uso. Genera un QR nuevo.',
      })
    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('rechaza códigos que no son JSON legible', async () => {
    allowPuestoAccess()

    await expect(confirmarQrInventario(PUESTO_ID, { codigo: 'esto-no-es-json' }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'El QR no tiene un formato válido',
      })
    expect(mp.inventario.findMany).not.toHaveBeenCalled()
    expect(mp.donacion.findFirst).not.toHaveBeenCalled()
  })

  it('rechaza códigos JSON que no son de solicitud ni de donación', async () => {
    allowPuestoAccess()

    await expect(confirmarQrInventario(PUESTO_ID, { codigo: JSON.stringify({ hola: 'mundo' }) }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'Formato de QR no reconocido',
      })
    expect(mp.inventario.findMany).not.toHaveBeenCalled()
    expect(mp.donacion.findFirst).not.toHaveBeenCalled()
  })

  it('rechaza una solicitud ciudadana sin productos válidos', async () => {
    allowPuestoAccess()

    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-sin-productos',
      p: PUESTO_ID,
      i: [{ n: 'Agua', q: 0, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'El QR no incluye productos válidos',
      })
    expect(mp.inventario.findMany).not.toHaveBeenCalled()
  })

  it('informa si el producto solicitado no existe en el inventario disponible', async () => {
    allowPuestoAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([])

    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-producto-inexistente',
      p: PUESTO_ID,
      i: [{ n: 'Agua', q: 1, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 404,
        message: 'No encuentro "Agua" en el inventario disponible',
      })
    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('informa si no hay stock suficiente para una solicitud ciudadana', async () => {
    allowPuestoAccess()
    mp.auditLog.findFirst.mockResolvedValue(null)
    mp.inventario.findMany.mockResolvedValue([{ ...ITEM_DISPONIBLE, cantidad: 2 }])

    const codigo = JSON.stringify({
      t: 'SC',
      r: 'sol-stock-insuficiente',
      p: PUESTO_ID,
      i: [{ n: 'Agua', q: 3, u: 'litros' }],
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'Stock insuficiente de Agua. Disponible: 2 litros',
      })
    expect(mp.inventario.updateMany).not.toHaveBeenCalled()
  })

  it('compensa necesidad, marca donación entregada y registra auditoria', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue({
      id: 'don-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      entregaCodigo: 'DEL-1',
      cantidad: 5,
      unidad: 'litros',
      estado: 'EN_CAMINO',
      producto: PRODUCTO,
    })
    mp.inventario.findUnique.mockResolvedValueOnce({
      ...ITEM_DISPONIBLE,
      id: 'nec-1',
      tipo: 'NECESARIO',
      cantidad: 2,
    }).mockResolvedValueOnce(null)
    mp.inventario.update.mockResolvedValue({
      ...ITEM_DISPONIBLE,
      id: 'nec-1',
      tipo: 'NECESARIO',
      cantidad: 0,
    })
    mp.inventario.create.mockResolvedValue({ ...ITEM_DISPONIBLE, id: 'disp-1', cantidad: 3 })
    // El update final incluye { producto, puesto } y el servicio los usa al
    // registrar el evento en la cadena (don.producto.nombre, don.puesto.nombre).
    mp.donacion.update.mockResolvedValue({
      id: 'don-1',
      estado: 'ENTREGADA',
      productoId: PRODUCTO.id,
      cantidad: 5,
      unidad: 'litros',
      entregaCodigo: 'DEL-1',
      producto: PRODUCTO,
      puesto: { nombre: 'Puesto Centro' },
    })

    const codigo = JSON.stringify({
      t: 'DE',
      p: PUESTO_ID,
      pr: PRODUCTO.id,
      d: 'don-1',
      e: 'DEL-1',
      q: 5,
      u: 'litros',
    })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID)

    expect(result.tipo).toBe('DONACION_ENTREGA')
    expect(mp.donacion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'don-1', entregaCodigo: 'DEL-1', estado: 'EN_CAMINO' }),
    }))
    expect(mp.donacion.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'don-1' },
      data: { estado: 'ENTREGADA' },
    }))
    expect(mp.inventario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cantidad: 3, tipo: 'DISPONIBLE' }),
    }))
  })

  it('rechaza una donación si el código ya no corresponde a una donación en camino', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(null)

    const codigo = JSON.stringify({
      t: 'DE',
      p: PUESTO_ID,
      pr: PRODUCTO.id,
      d: 'don-1',
      e: 'DEL-usado',
      q: 5,
      u: 'litros',
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 409,
        message: 'Este QR de donación no se puede confirmar: no existe, ya fue usado o la donación no está en camino.',
      })
    expect(mp.donacion.update).not.toHaveBeenCalled()
  })

  it('rechaza una donación si el contenido del QR no coincide con lo registrado', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue({
      id: 'don-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      entregaCodigo: 'DEL-1',
      cantidad: 5,
      unidad: 'litros',
      estado: 'EN_CAMINO',
      producto: PRODUCTO,
    })

    // La cantidad ahora se auto-reconcilia (gana la del QR/override), asi que el
    // 400 "no coincide" solo salta por desajuste de unidad.
    const codigo = JSON.stringify({
      t: 'DE',
      p: PUESTO_ID,
      pr: PRODUCTO.id,
      d: 'don-1',
      e: 'DEL-1',
      q: 5,
      u: 'kilos',
    })

    await expect(confirmarQrInventario(PUESTO_ID, { codigo }, USER_ID))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'El contenido del QR no coincide con la donación registrada',
      })
    expect(mp.donacion.update).not.toHaveBeenCalled()
  })
})

describe('getEstadoSolicitudQr', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('devuelve pendiente si la solicitud ciudadana aun no se ha escaneado', async () => {
    mp.auditLog.findFirst.mockResolvedValue(null)

    await expect(getEstadoSolicitudQr('sol-pendiente')).resolves.toEqual({
      estado: 'PENDIENTE',
    })
  })

  it('devuelve completada si el QR ciudadano ya fue confirmado en el puesto', async () => {
    const completedAt = new Date('2026-05-18T10:00:00.000Z')
    mp.auditLog.findFirst.mockResolvedValue({ createdAt: completedAt })

    await expect(getEstadoSolicitudQr('sol-completada')).resolves.toEqual({
      estado: 'COMPLETADA',
      completedAt,
    })
  })
})
