import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    puestoEmergencia: { findUnique: vi.fn() },
    producto: { findFirst: vi.fn(), create: vi.fn() },
    inventario: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { addItem } from '../../../backend/src/modules/inventario/inventario.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUESTO_ID = 'puesto-add-1'
const USER_ID = 'user-add-1'
const PRODUCTO = { id: 'prod-agua', nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' }

function allowAccess() {
  mp.puestoEmergencia.findUnique.mockResolvedValue({
    adminId: USER_ID,
    trabajadores: [],
    asignacionesVoluntarios: [],
  })
}

function mockProducto() {
  mp.producto.findFirst.mockResolvedValue(PRODUCTO)
}

// ── addItem: DISPONIBLE y NECESARIO son independientes ────────────────────────

describe('addItem — independencia disponible/necesario', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('al agregar DISPONIBLE crea el item integro sin tocar la NECESIDAD del producto', async () => {
    allowAccess()
    mockProducto()

    // No existe DISPONIBLE previo del mismo producto.
    mp.inventario.findUnique.mockResolvedValueOnce(null)
    mp.inventario.create.mockResolvedValue({
      id: 'disp-nuevo',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 10,
      producto: PRODUCTO,
    })

    const result = await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 10,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    // Solo consulta el inventario del MISMO tipo, nunca el opuesto.
    expect(mp.inventario.findUnique).toHaveBeenCalledTimes(1)
    expect(mp.inventario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puestoId_productoId_tipo: { puestoId: PUESTO_ID, productoId: PRODUCTO.id, tipo: 'DISPONIBLE' } },
      }),
    )
    // No compensa ninguna necesidad: nada de update, crea el DISPONIBLE integro.
    expect(mp.inventario.update).not.toHaveBeenCalled()
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 10, tipo: 'DISPONIBLE' }),
      }),
    )
    expect(result.cantidad).toBe(10)
  })

  it('la cantidad aportada se guarda integra como DISPONIBLE (sin descontar necesidad)', async () => {
    allowAccess()
    mockProducto()

    mp.inventario.findUnique.mockResolvedValueOnce(null)
    mp.inventario.create.mockResolvedValue({
      id: 'disp-nuevo',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 10,
      producto: PRODUCTO,
    })

    await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 10,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    // Antes la necesidad absorbia parte; ahora entra integra como disponible.
    expect(mp.inventario.update).not.toHaveBeenCalled()
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 10, tipo: 'DISPONIBLE' }),
      }),
    )
  })

  it('al agregar NECESARIO crea el item integro sin tocar el DISPONIBLE del producto', async () => {
    allowAccess()
    mockProducto()

    mp.inventario.findUnique.mockResolvedValueOnce(null)
    mp.inventario.create.mockResolvedValue({
      id: 'nec-nuevo',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 5,
      producto: PRODUCTO,
    })

    const result = await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 5,
      tipo: 'NECESARIO',
    }, USER_ID)

    expect(mp.inventario.findUnique).toHaveBeenCalledTimes(1)
    expect(mp.inventario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puestoId_productoId_tipo: { puestoId: PUESTO_ID, productoId: PRODUCTO.id, tipo: 'NECESARIO' } },
      }),
    )
    expect(mp.inventario.update).not.toHaveBeenCalled()
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 5, tipo: 'NECESARIO' }),
      }),
    )
    expect(result.cantidad).toBe(5)
  })

  it('crea el producto si no existe todavia en la base de datos', async () => {
    allowAccess()
    mp.producto.findFirst.mockResolvedValue(null) // producto no existe
    mp.producto.create.mockResolvedValue(PRODUCTO)
    mp.inventario.findUnique.mockResolvedValue(null).mockResolvedValue(null)
    mp.inventario.create.mockResolvedValue({
      id: 'nuevo-item',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 5,
      producto: PRODUCTO,
    })

    await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 5,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    expect(mp.producto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nombre: 'Agua embotellada' }),
      }),
    )
  })

  it('incrementa el item existente del mismo tipo sin crear uno nuevo', async () => {
    allowAccess()
    mockProducto()

    const existente = {
      id: 'disp-existente',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 8,
    }

    mp.inventario.findUnique.mockResolvedValueOnce(existente) // ya hay DISPONIBLE del mismo tipo

    mp.inventario.update.mockResolvedValue({
      ...existente,
      cantidad: 13,
      producto: PRODUCTO,
    })

    const result = await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 5,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disp-existente' },
        data: { cantidad: 13 }, // 8 + 5
      }),
    )
    expect(mp.inventario.create).not.toHaveBeenCalled()
    expect(result.cantidad).toBe(13)
  })

  it('crea un item nuevo cuando no existe ni opuesto ni mismo tipo previo', async () => {
    allowAccess()
    mockProducto()

    mp.inventario.findUnique
      .mockResolvedValueOnce(null) // sin opuesto
      .mockResolvedValueOnce(null) // sin mismo tipo

    mp.inventario.create.mockResolvedValue({
      id: 'item-creado',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 20,
      producto: PRODUCTO,
    })

    const result = await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 20,
      tipo: 'NECESARIO',
    }, USER_ID)

    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ puestoId: PUESTO_ID, cantidad: 20, tipo: 'NECESARIO' }),
      }),
    )
    expect(result.cantidad).toBe(20)
  })

  it('registra auditoria despues de crear o actualizar un item', async () => {
    allowAccess()
    mockProducto()

    mp.inventario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    mp.inventario.create.mockResolvedValue({
      id: 'item-audit',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 3,
      producto: PRODUCTO,
    })

    await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 3,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioId: USER_ID,
          entidad: 'PUESTO_INVENTARIO',
          entidadId: PUESTO_ID,
        }),
      }),
    )
  })
})
