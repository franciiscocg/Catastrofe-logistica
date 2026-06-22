import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => {
  const prisma = {
    puestoEmergencia: { findUnique: vi.fn() },
    inventario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((callback) => callback(prisma)),
  }
  return { prisma }
})

import { prisma } from '../../../backend/src/lib/prisma.js'
import { updateCantidad } from '../../../backend/src/modules/inventario/inventario.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const USER_ID = 'user-1'
const PUESTO_ID = 'puesto-1'
const PRODUCTO = { id: 'prod-agua', nombre: 'Agua', categoria: 'Bebidas', unidad: 'litros' }

function allowPuestoAccess() {
  mp.puestoEmergencia.findUnique.mockResolvedValue({
    adminId: USER_ID,
    trabajadores: [],
    asignacionesVoluntarios: [],
  })
}

describe('balance de inventario disponible/necesario', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mp.$transaction.mockImplementation((callback: unknown) => (callback as (tx: unknown) => unknown)(mp))
  })

  it('al aumentar disponible no modifica la necesidad del mismo producto', async () => {
    allowPuestoAccess()
    const disponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 0,
    }

    // Solo se consulta y actualiza el propio item; nunca el opuesto.
    mp.inventario.findUnique.mockResolvedValueOnce(disponible)
    mp.inventario.update.mockResolvedValueOnce({ ...disponible, cantidad: 10, producto: PRODUCTO })

    const result = await updateCantidad('disp-1', { delta: 10 }, USER_ID)

    expect(result.cantidad).toBe(10)
    expect(mp.inventario.update).toHaveBeenCalledTimes(1)
    expect(mp.inventario.update).toHaveBeenCalledWith({
      where: { id: 'disp-1' },
      data: { cantidad: 10 },
      include: { producto: true },
    })
  })

  it('la cantidad disponible se actualiza integra (sin descontar necesidad)', async () => {
    allowPuestoAccess()
    const disponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 0,
    }

    mp.inventario.findUnique.mockResolvedValueOnce(disponible)
    mp.inventario.update.mockResolvedValueOnce({ ...disponible, cantidad: 15, producto: PRODUCTO })

    const result = await updateCantidad('disp-1', { delta: 15 }, USER_ID)

    expect(result.cantidad).toBe(15)
    expect(mp.inventario.update).toHaveBeenCalledTimes(1)
    expect(mp.inventario.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { cantidad: 15 },
    }))
  })

  it('al aumentar necesario no modifica el disponible del mismo producto', async () => {
    allowPuestoAccess()
    const necesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 0,
    }

    mp.inventario.findUnique.mockResolvedValueOnce(necesario)
    mp.inventario.update.mockResolvedValueOnce({ ...necesario, cantidad: 10, producto: PRODUCTO })

    const result = await updateCantidad('nec-1', { delta: 10 }, USER_ID)

    expect(result.cantidad).toBe(10)
    expect(mp.inventario.update).toHaveBeenCalledTimes(1)
    expect(mp.inventario.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'nec-1' },
      data: { cantidad: 10 },
    }))
  })
})
