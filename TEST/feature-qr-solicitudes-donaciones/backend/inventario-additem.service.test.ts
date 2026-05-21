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

// ── addItem con compensacion de inventario ────────────────────────────────────

describe('addItem — compensacion disponible/necesario', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('al agregar DISPONIBLE, primero reduce la NECESIDAD del mismo producto', async () => {
    allowAccess()
    mockProducto()

    const itemNecesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 10,
      producto: PRODUCTO,
    }

    // findUnique: 1a llamada busca NECESARIO (el opuesto al DISPONIBLE que se quiere agregar)
    // 2a llamada busca si ya existe DISPONIBLE del mismo producto
    mp.inventario.findUnique
      .mockResolvedValueOnce(itemNecesario)
      .mockResolvedValueOnce(null)

    // Despues de compensar la necesidad (10), el sobrante es 0 → devuelve el opuesto actualizado
    mp.inventario.update.mockResolvedValue({ ...itemNecesario, cantidad: 0 })

    const result = await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 10,
      tipo: 'DISPONIBLE',
    }, USER_ID)

    // Reducio la necesidad a 0
    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'nec-1' },
        data: { cantidad: 0 },
      }),
    )
    // No creo un item DISPONIBLE porque la compensacion absorbio todo
    expect(mp.inventario.create).not.toHaveBeenCalled()
    expect(result.cantidad).toBe(0)
  })

  it('si se aporta mas de lo necesario, crea el sobrante como DISPONIBLE', async () => {
    allowAccess()
    mockProducto()

    const itemNecesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 6,
      producto: PRODUCTO,
    }

    mp.inventario.findUnique
      .mockResolvedValueOnce(itemNecesario) // opuesto NECESARIO
      .mockResolvedValueOnce(null) // no hay DISPONIBLE previo

    mp.inventario.update.mockResolvedValue({ ...itemNecesario, cantidad: 0 })
    mp.inventario.create.mockResolvedValue({
      id: 'disp-nuevo',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 4,
      producto: PRODUCTO,
    })

    await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 10, // 6 cubren necesidad, 4 quedan como disponible
      tipo: 'DISPONIBLE',
    }, USER_ID)

    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cantidad: 0 } }),
    )
    expect(mp.inventario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidad: 4, tipo: 'DISPONIBLE' }),
      }),
    )
  })

  it('al agregar NECESARIO, primero reduce el DISPONIBLE del mismo producto', async () => {
    allowAccess()
    mockProducto()

    const itemDisponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 5,
      producto: PRODUCTO,
    }

    mp.inventario.findUnique
      .mockResolvedValueOnce(itemDisponible) // opuesto DISPONIBLE
      .mockResolvedValueOnce(null) // no hay NECESARIO previo

    mp.inventario.update.mockResolvedValue({ ...itemDisponible, cantidad: 0 })

    await addItem(PUESTO_ID, {
      nombre: 'Agua embotellada',
      categoria: 'Bebidas',
      unidad: 'litros',
      cantidad: 5,
      tipo: 'NECESARIO',
    }, USER_ID)

    expect(mp.inventario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'disp-1' },
        data: { cantidad: 0 },
      }),
    )
    expect(mp.inventario.create).not.toHaveBeenCalled()
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

    mp.inventario.findUnique
      .mockResolvedValueOnce(null) // sin opuesto NECESARIO
      .mockResolvedValueOnce(existente) // ya hay DISPONIBLE

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
