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

  it('al aumentar disponible, primero compensa la necesidad del mismo producto', async () => {
    allowPuestoAccess()
    const disponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 0,
    }
    const necesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 10,
      producto: PRODUCTO,
    }

    mp.inventario.findUnique
      .mockResolvedValueOnce(disponible)
      .mockResolvedValueOnce(necesario)
    mp.inventario.update
      .mockResolvedValueOnce({ ...necesario, cantidad: 0 })
      .mockResolvedValueOnce({ ...disponible, cantidad: 0, producto: PRODUCTO })

    const result = await updateCantidad('disp-1', { delta: 10 }, USER_ID)

    expect(result.cantidad).toBe(0)
    expect(mp.inventario.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'nec-1' },
      data: { cantidad: 0 },
      include: { producto: true },
    })
    expect(mp.inventario.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'disp-1' },
      data: { cantidad: 0 },
      include: { producto: true },
    })
  })

  it('si entra mas de lo necesario, deja solo el sobrante como disponible', async () => {
    allowPuestoAccess()
    const disponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 0,
    }
    const necesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 10,
      producto: PRODUCTO,
    }

    mp.inventario.findUnique
      .mockResolvedValueOnce(disponible)
      .mockResolvedValueOnce(necesario)
    mp.inventario.update
      .mockResolvedValueOnce({ ...necesario, cantidad: 0 })
      .mockResolvedValueOnce({ ...disponible, cantidad: 5, producto: PRODUCTO })

    const result = await updateCantidad('disp-1', { delta: 15 }, USER_ID)

    expect(result.cantidad).toBe(5)
    expect(mp.inventario.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { cantidad: 5 },
    }))
  })

  it('al aumentar necesario, primero compensa el disponible del mismo producto', async () => {
    allowPuestoAccess()
    const necesario = {
      id: 'nec-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'NECESARIO',
      cantidad: 0,
    }
    const disponible = {
      id: 'disp-1',
      puestoId: PUESTO_ID,
      productoId: PRODUCTO.id,
      tipo: 'DISPONIBLE',
      cantidad: 4,
      producto: PRODUCTO,
    }

    mp.inventario.findUnique
      .mockResolvedValueOnce(necesario)
      .mockResolvedValueOnce(disponible)
    mp.inventario.update
      .mockResolvedValueOnce({ ...disponible, cantidad: 0 })
      .mockResolvedValueOnce({ ...necesario, cantidad: 6, producto: PRODUCTO })

    const result = await updateCantidad('nec-1', { delta: 10 }, USER_ID)

    expect(result.cantidad).toBe(6)
    expect(mp.inventario.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'disp-1' },
      data: { cantidad: 0 },
    }))
  })
})
