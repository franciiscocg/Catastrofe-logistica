import { describe, it, expect, vi, beforeEach } from 'vitest'

const { appendChainEvent } = vi.hoisted(() => ({ appendChainEvent: vi.fn() }))

vi.mock('../../../backend/src/lib/chain.js', () => ({ appendChainEvent }))

vi.mock('../../../backend/src/lib/prisma.js', () => {
  const prisma = {
    puestoEmergencia: { findUnique: vi.fn() },
    inventario: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    donacion: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    qrConsumption: { create: vi.fn() },
    voluntario: { findUnique: vi.fn(), create: vi.fn() },
    usuario: { findUnique: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn((callback) => callback(prisma)),
  }
  return { prisma }
})

import { prisma } from '../../../backend/src/lib/prisma.js'
import { confirmarQrInventario } from '../../../backend/src/modules/inventario/inventario.service.js'
import { generarCodigoEntrega } from '../../../backend/src/modules/donaciones/donaciones.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUESTO_ID = 'puesto-de-1'
const USER_ID = 'user-de-1'
const VOLUNTARIO_ID = 'voluntario-1'
const DONACION_ID = 'donacion-1'
const PRODUCTO = { id: 'prod-agua', nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' }
const PUESTO_DATA = {
  id: PUESTO_ID,
  nombre: 'CEIP La Paz',
  direccion: 'Calle Mayor 1',
  latitud: 39.47,
  longitud: -0.37,
  tipo: 'DISTRIBUCION',
  activo: true,
  catastrofeId: 'cat-1',
}

function allowPuestoAccess() {
  mp.puestoEmergencia.findUnique.mockResolvedValue({
    adminId: USER_ID,
    trabajadores: [],
    asignacionesVoluntarios: [],
  })
}

function donacionEnCamino(overrides: Record<string, unknown> = {}) {
  return {
    id: DONACION_ID,
    puestoId: PUESTO_ID,
    productoId: PRODUCTO.id,
    entregaCodigo: 'DEL-codigo-1',
    cantidad: 5,
    unidad: 'litros',
    estado: 'EN_CAMINO',
    producto: PRODUCTO,
    puesto: PUESTO_DATA,
    ...overrides,
  }
}

function codigoDECompacto(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    t: 'DE',
    p: PUESTO_ID,
    pr: PRODUCTO.id,
    d: DONACION_ID,
    e: 'DEL-codigo-1',
    q: 5,
    u: 'litros',
    ...overrides,
  })
}

// ── confirmarQrInventario — entrega de donacion (DE) ─────────────────────────

describe('confirmarQrInventario — entrega de donación (DE)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation(
      (callback: unknown) => (callback as (tx: unknown) => unknown)(mp),
    )
    mp.donacion.updateMany.mockResolvedValue({ count: 1 })
  })

  it('compensa necesidad disponible y marca la donación como ENTREGADA', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino())
    mp.inventario.findUnique
      .mockResolvedValueOnce({
        id: 'nec-1',
        puestoId: PUESTO_ID,
        productoId: PRODUCTO.id,
        tipo: 'NECESARIO',
        cantidad: 3,
        producto: PRODUCTO,
      })
      .mockResolvedValueOnce(null) // no hay DISPONIBLE existente
    mp.inventario.update.mockResolvedValue({
      id: 'nec-1',
      tipo: 'NECESARIO',
      cantidad: 0,
      producto: PRODUCTO,
    })
    mp.inventario.create.mockResolvedValue({
      id: 'disp-1',
      tipo: 'DISPONIBLE',
      cantidad: 2,
      producto: PRODUCTO,
    })
    mp.donacion.update.mockResolvedValue({ ...donacionEnCamino(), estado: 'ENTREGADA' })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID)

    expect(result.tipo).toBe('DONACION_ENTREGA')
    expect(mp.donacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DONACION_ID }, data: { estado: 'ENTREGADA' } }),
    )
    // La necesidad (3 unidades) queda en 0 y el sobrante (2) va a DISPONIBLE
    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cantidad: 0 }, include: { producto: true } }),
    )
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 2, tipo: 'DISPONIBLE' }),
      }),
    )
    expect(appendChainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'DONACION_ENTREGADA',
        payload: expect.not.objectContaining({ entregaCodigo: expect.anything() }),
      }),
    )
  })

  it('rechaza confirmar una cantidad mayor que la donación registrada', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino({ cantidad: 5 }))

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto(), cantidadOverride: 6 }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(mp.donacion.updateMany).not.toHaveBeenCalled()
    expect(mp.inventario.update).not.toHaveBeenCalled()
    expect(mp.inventario.create).not.toHaveBeenCalled()
  })

  it('crea directamente el item DISPONIBLE si no hay necesidad previa', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino())
    mp.inventario.findUnique
      .mockResolvedValueOnce(null) // sin necesidad
      .mockResolvedValueOnce(null) // sin disponible previo
    mp.inventario.create.mockResolvedValue({
      id: 'disp-nuevo',
      tipo: 'DISPONIBLE',
      cantidad: 5,
      producto: PRODUCTO,
    })
    mp.donacion.update.mockResolvedValue({ ...donacionEnCamino(), estado: 'ENTREGADA' })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID)

    expect(result.tipo).toBe('DONACION_ENTREGA')
    expect(mp.inventario.update).not.toHaveBeenCalled()
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 5, tipo: 'DISPONIBLE' }),
      }),
    )
  })

  it('incrementa el DISPONIBLE existente si ya hay stock del mismo producto', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino())
    mp.inventario.findUnique
      .mockResolvedValueOnce(null) // sin necesidad
      .mockResolvedValueOnce({ id: 'disp-existente', cantidad: 10, tipo: 'DISPONIBLE' }) // ya hay stock
    mp.inventario.update.mockResolvedValue({
      id: 'disp-existente',
      tipo: 'DISPONIBLE',
      cantidad: 15,
      producto: PRODUCTO,
    })
    mp.donacion.update.mockResolvedValue({ ...donacionEnCamino(), estado: 'ENTREGADA' })

    await confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID)

    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disp-existente' },
        data: { cantidad: 15 },
      }),
    )
    expect(mp.inventario.create).not.toHaveBeenCalled()
  })

  it('rechaza (409) si la donación no existe, ya fue usada o no está EN_CAMINO', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(null)

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        'Este QR de donación no se puede confirmar: no existe, ya fue usado o la donación no está en camino.',
    })

    expect(mp.donacion.update).not.toHaveBeenCalled()
  })

  it('solo aplica una entrega ante dos escaneos simultaneos del mismo QR', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino())
    mp.donacion.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    mp.inventario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mp.inventario.create.mockResolvedValue({
      id: 'disp-nuevo',
      tipo: 'DISPONIBLE',
      cantidad: 5,
      producto: PRODUCTO,
    })
    mp.donacion.update.mockResolvedValue({ ...donacionEnCamino(), estado: 'ENTREGADA' })

    const confirmations = await Promise.allSettled([
      confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID),
      confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto() }, USER_ID),
    ])

    expect(confirmations.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(confirmations.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(mp.inventario.create).toHaveBeenCalledOnce()
  })

  it('reconcilia la cantidad cuando el QR difiere y marca la donación ENTREGADA', async () => {
    // La cantidad del QR/override ahora gana: la donacion se actualiza para
    // cuadrar con lo entregado en lugar de rechazarse. (El 400 por desajuste
    // queda solo para la unidad — cubierto por el test siguiente.)
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino()) // donacion tiene cantidad 5
    mp.inventario.findUnique
      .mockResolvedValueOnce(null) // sin necesidad
      .mockResolvedValueOnce(null) // sin disponible previo
    mp.inventario.create.mockResolvedValue({
      id: 'disp-1', tipo: 'DISPONIBLE', cantidad: 4, producto: PRODUCTO,
    })
    mp.donacion.update.mockResolvedValue({ ...donacionEnCamino(), cantidad: 4, estado: 'ENTREGADA' })

    const result = await confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto({ q: 4 }) }, USER_ID)

    expect(result.tipo).toBe('DONACION_ENTREGA')
    // La donacion se reconcilia a la cantidad del QR (4) antes de entregarse.
    expect(mp.donacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DONACION_ID }, data: { cantidad: 4 } }),
    )
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cantidad: 4, tipo: 'DISPONIBLE' }) }),
    )
  })

  it('rechaza (400) si la unidad del QR no coincide con la donación registrada', async () => {
    allowPuestoAccess()
    mp.donacion.findFirst.mockResolvedValue(donacionEnCamino()) // donacion tiene unidad 'litros'

    const codigoUnidadErronea = codigoDECompacto({ u: 'kg' }) // QR dice 'kg'

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoUnidadErronea }, USER_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'El contenido del QR no coincide con la donación registrada',
    })
  })

  it('rechaza el DE de un puesto distinto al puesto actual', async () => {
    allowPuestoAccess()

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoDECompacto({ p: 'otro-puesto' }) }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Este QR pertenece a otro puesto' })
  })

  it('rechaza un QR DE que no incluye código de entrega', async () => {
    allowPuestoAccess()

    const codigoSinEntregaCodigo = JSON.stringify({
      t: 'DE',
      p: PUESTO_ID,
      pr: PRODUCTO.id,
      q: 5,
      u: 'litros',
      // sin 'e' ni 'd'
    })

    await expect(
      confirmarQrInventario(PUESTO_ID, { codigo: codigoSinEntregaCodigo }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

// ── generarCodigoEntrega ──────────────────────────────────────────────────────

describe('generarCodigoEntrega', () => {
  beforeEach(() => vi.resetAllMocks())

  it('genera un código corto de 6 caracteres cuando la donación está EN_CAMINO y no tiene código previo', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID,
      estado: 'EN_CAMINO',
      entregaCodigo: null,
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })
    mp.donacion.update.mockResolvedValue({
      id: DONACION_ID,
      estado: 'EN_CAMINO',
      entregaCodigo: 'A3F9B2',
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })

    const result = await generarCodigoEntrega(USER_ID, DONACION_ID)

    expect(result.entregaCodigo).toBe('A3F9B2')
    expect(mp.donacion.update).toHaveBeenCalledOnce()
    expect(mp.donacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DONACION_ID },
        data: expect.objectContaining({
          // Código corto, alfanumérico en mayúsculas, fácil de teclear a mano.
          entregaCodigo: expect.stringMatching(/^[A-Z0-9]{6}$/),
        }),
      }),
    )
  })

  it('es idempotente: devuelve el código existente sin crear uno nuevo', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID,
      estado: 'EN_CAMINO',
      entregaCodigo: 'DEL-ya-existe',
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })

    const result = await generarCodigoEntrega(USER_ID, DONACION_ID)

    expect(result.entregaCodigo).toBe('DEL-ya-existe')
    expect(mp.donacion.update).not.toHaveBeenCalled()
  })

  it('rechaza (400) si la donación ya fue entregada o cancelada', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID,
      estado: 'ENTREGADA',
      entregaCodigo: null,
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })

    await expect(generarCodigoEntrega(USER_ID, DONACION_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Solo puedes generar el código cuando la donación está pendiente o en camino',
    })
  })

  it('rechaza (404) si la donación no pertenece al voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)

    await expect(generarCodigoEntrega(USER_ID, 'don-ajena')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('crea el perfil de voluntario si tiene rol VOLUNTARIO pero no tiene fila Voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)
    mp.usuario.findUnique.mockResolvedValue({ roles: ['CIUDADANO', 'VOLUNTARIO'] })
    mp.voluntario.create.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({
      id: DONACION_ID,
      estado: 'EN_CAMINO',
      entregaCodigo: null,
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })
    mp.donacion.update.mockResolvedValue({
      id: DONACION_ID,
      estado: 'EN_CAMINO',
      entregaCodigo: 'DEL-nuevo',
      producto: PRODUCTO,
      puesto: PUESTO_DATA,
    })

    await generarCodigoEntrega(USER_ID, DONACION_ID)

    expect(mp.voluntario.create).toHaveBeenCalledWith({
      data: { usuarioId: USER_ID },
      select: { id: true },
    })
  })
})
