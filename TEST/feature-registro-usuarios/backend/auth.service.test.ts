import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    voluntario: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
    catastrofe: {
      findFirst: vi.fn(),
    },
    solicitudPuesto: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        usuario: {
          create: prismaMock.usuario.create,
        },
        voluntario: {
          create: prismaMock.voluntario.create,
        },
        catastrofe: {
          findFirst: prismaMock.catastrofe.findFirst,
        },
        solicitudPuesto: {
          create: prismaMock.solicitudPuesto.create,
        },
      }),
    ),
  }
  return { prismaMock }
})

const { mockHash, mockCompare } = vi.hoisted(() => ({
  mockHash: vi.fn(async (value: string) => `hashed:${value}`),
  mockCompare: vi.fn(),
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: mockHash,
    compare: mockCompare,
  },
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: prismaMock,
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { loginUser, registerUser } from '../../../backend/src/modules/auth/auth.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['email', 'maria@example.com', { email: 'maria@example.com' }],
    ['dni', '12345678a', { dni: '12345678A' }],
  ])('permite iniciar sesion con %s', async (_tipo, identifier, where) => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'maria@example.com',
      password: 'hashed:Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      activo: true,
    })

    const user = await loginUser({ identifier, password: 'Password123' })

    expect(mp.usuario.findUnique).toHaveBeenCalledWith({ where })
    expect(mockCompare).toHaveBeenCalledWith('Password123', 'hashed:Password123')
    expect(mp.voluntario.upsert).toHaveBeenCalledWith({
      where: { usuarioId: 'user-1' },
      update: {},
      create: { usuarioId: 'user-1' },
    })
    expect(user).toMatchObject({
      id: 'user-1',
      email: 'maria@example.com',
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    })
  })

  it('crea usuarios normales con roles ciudadano y voluntario', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'maria@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: undefined,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    })

    const result = await registerUser({
      email: 'maria@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678a',
    })

    expect(result.puesto).toBeNull()
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        password: 'hashed:Password123',
        dni: '12345678A',
        roles: ['CIUDADANO', 'VOLUNTARIO'],
        activo: true,
      }),
    }))
    expect(mp.voluntario.create).toHaveBeenCalledWith({
      data: { usuarioId: 'user-1' },
    })
  })

  it('crea una solicitud de puesto inactiva y pendiente de aprobacion', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'puesto@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: '+34600000000',
      roles: ['PUESTO_EMERGENCIA'],
    })
    mp.catastrofe.findFirst.mockResolvedValue({ id: 'cat-1' })
    mp.solicitudPuesto.create.mockResolvedValue({
      id: 'solicitud-1',
      nombre: 'CEIP La Paz',
      estado: 'PENDIENTE',
    })

    const result = await registerUser({
      email: 'puesto@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: '+34600000000',
      dni: '12345678A',
      puesto: {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        latitud: 39.4254,
        longitud: -0.4178,
      },
    })

    expect(result.puesto).toBeNull()
    expect(result.solicitud).toMatchObject({ id: 'solicitud-1', estado: 'PENDIENTE' })
    expect(mp.voluntario.create).not.toHaveBeenCalled()
    expect(mp.solicitudPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        usuarioId: 'user-1',
        nombre: 'CEIP La Paz',
        direccion: 'Calle Mayor 12',
      }),
    }))
  })
})
