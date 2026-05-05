import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    puestoTrabajador: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    puestoEmergencia: {
      findUnique: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  addTrabajador,
  listTrabajadores,
  removeTrabajador,
} from '../../../backend/src/modules/puestos/trabajadores.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

const PUESTO = { id: 'puesto-1', adminId: 'admin-1', nombre: 'CEIP La Paz' }
const USUARIO = {
  id: 'user-2',
  nombre: 'Ana',
  apellidos: 'Lopez',
  email: 'ana@example.com',
  roles: ['CIUDADANO'],
}

describe('listTrabajadores', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lista trabajadores ordenados por fecha de alta', async () => {
    const trabajadores = [{ id: 'rel-1', usuario: USUARIO }]
    mp.puestoTrabajador.findMany.mockResolvedValue(trabajadores)

    const result = await listTrabajadores('puesto-1')

    expect(result).toEqual(trabajadores)
    expect(mp.puestoTrabajador.findMany).toHaveBeenCalledWith({
      where: { puestoId: 'puesto-1' },
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true } },
      },
      orderBy: { addedAt: 'asc' },
    })
  })
})

describe('addTrabajador', () => {
  beforeEach(() => vi.clearAllMocks())

  it('anade trabajador y le asigna rol PUESTO_EMERGENCIA si no lo tenia', async () => {
    const creado = { id: 'rel-1', puestoId: 'puesto-1', usuarioId: USUARIO.id, usuario: USUARIO }
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.usuario.findUnique.mockResolvedValue(USUARIO)
    mp.usuario.update.mockResolvedValue({ ...USUARIO, roles: ['CIUDADANO', 'PUESTO_EMERGENCIA'] })
    mp.puestoTrabajador.create.mockResolvedValue(creado)

    const result = await addTrabajador('puesto-1', USUARIO.email, 'admin-1')

    expect(result).toEqual(creado)
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: USUARIO.id },
      data: { roles: { push: 'PUESTO_EMERGENCIA' } },
    })
    expect(mp.puestoTrabajador.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { puestoId: 'puesto-1', usuarioId: USUARIO.id, addedBy: 'admin-1' },
      }),
    )
  })

  it('no duplica el rol si el usuario ya es puesto de emergencia', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.usuario.findUnique.mockResolvedValue({ ...USUARIO, roles: ['PUESTO_EMERGENCIA'] })
    mp.puestoTrabajador.create.mockResolvedValue({ id: 'rel-1' })

    await addTrabajador('puesto-1', USUARIO.email, 'admin-1')

    expect(mp.usuario.update).not.toHaveBeenCalled()
    expect(mp.puestoTrabajador.create).toHaveBeenCalledOnce()
  })

  it('lanza 404 si el puesto no existe', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(null)

    await expect(addTrabajador('no-existe', USUARIO.email, 'admin-1'))
      .rejects.toMatchObject({ statusCode: 404, message: 'Puesto no encontrado' })
  })

  it('lanza 403 si quien anade no es admin del puesto', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)

    await expect(addTrabajador('puesto-1', USUARIO.email, 'otro-user'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('lanza 404 si no existe cuenta con ese email', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.usuario.findUnique.mockResolvedValue(null)

    await expect(addTrabajador('puesto-1', 'nadie@example.com', 'admin-1'))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('lanza 409 si se intenta anadir al admin como trabajador', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.usuario.findUnique.mockResolvedValue({ ...USUARIO, id: 'admin-1' })

    await expect(addTrabajador('puesto-1', 'admin@example.com', 'admin-1'))
      .rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('removeTrabajador', () => {
  beforeEach(() => vi.clearAllMocks())

  it('elimina la relacion trabajador-puesto si la solicita el admin', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.puestoTrabajador.findUnique.mockResolvedValue({ id: 'rel-1' })
    mp.puestoTrabajador.delete.mockResolvedValue({ id: 'rel-1' })

    await removeTrabajador('puesto-1', 'user-2', 'admin-1')

    expect(mp.puestoTrabajador.delete).toHaveBeenCalledWith({
      where: { puestoId_usuarioId: { puestoId: 'puesto-1', usuarioId: 'user-2' } },
    })
  })

  it('lanza 403 si quien elimina no es admin', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)

    await expect(removeTrabajador('puesto-1', 'user-2', 'otro-user'))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('lanza 404 si el trabajador no pertenece al puesto', async () => {
    mp.puestoEmergencia.findUnique.mockResolvedValue(PUESTO)
    mp.puestoTrabajador.findUnique.mockResolvedValue(null)

    await expect(removeTrabajador('puesto-1', 'user-2', 'admin-1'))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
