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
    solicitudPuesto: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        usuario: prismaMock.usuario,
        voluntario: prismaMock.voluntario,
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
  default: { hash: mockHash, compare: mockCompare },
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { loginUser, registerUser } from '../../../backend/src/modules/auth/auth.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any
const PASSWORD_HASH = '$2a$12$CWU2PWH3aCQqnwskDa.I9uwQSsjCbrzy9uhVfMD0txvaLdOjwwR0u'

describe('registerUser - registro unificado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crea usuario con roles CIUDADANO y VOLUNTARIO', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'maria@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      emailVerified: true,
    })

    const result = await registerUser({
      email: 'maria@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678A',
    })

    expect(result.user.roles).toEqual(['CIUDADANO', 'VOLUNTARIO'])
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'maria@example.com',
        password: expect.any(String),
        dni: '12345678A',
        roles: ['CIUDADANO', 'VOLUNTARIO'],
        activo: true,
        emailVerified: false,
        emailVerifiedAt: null,
      }),
    }))
    expect(mp.voluntario.create).toHaveBeenCalledWith({
      data: { usuarioId: 'user-1' },
    })
  })

  it('normaliza el DNI a mayusculas al registrar', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'maria@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      emailVerified: true,
    })

    await registerUser({
      email: 'maria@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678a',
    })

    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dni: '12345678A' }),
    }))
  })

  it('no crea solicitudes de puesto desde /auth/register aunque llegue un payload legacy', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'puesto@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: '+34600000000',
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      emailVerified: true,
    })

    const result = await registerUser(({
      email: 'puesto@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678A',
      telefono: '+34600000000',
      puesto: {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        latitud: 39.4254,
        longitud: -0.4178,
      },
    }) as Parameters<typeof registerUser>[0] & { puesto: unknown })

    expect(result.user.roles).toEqual(['CIUDADANO', 'VOLUNTARIO'])
    expect(mp.solicitudPuesto.create).not.toHaveBeenCalled()
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roles: ['CIUDADANO', 'VOLUNTARIO'] }),
    }))
  })

  it('lanza error 400 si el email ya está registrado', async () => {
    mp.usuario.findUnique.mockResolvedValue({ id: 'existing-user' })

    await expect(registerUser({
      email: 'ya-existe@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678A',
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/email/) })
  })

  it('lanza error 400 si el DNI ya está registrado', async () => {
    mp.usuario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-user' })

    await expect(registerUser({
      email: 'nuevo@example.com',
      password: 'Password123',
      nombre: 'Maria',
      apellidos: 'Garcia',
      dni: '12345678A',
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/DNI/) })
  })
})

describe('loginUser', () => {
  const usuarioBase = {
    id: 'user-1',
    email: 'maria@example.com',
    password: PASSWORD_HASH,
    nombre: 'Maria',
    apellidos: 'Garcia',
    telefono: null,
    roles: ['CIUDADANO', 'VOLUNTARIO'],
    activo: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('permite iniciar sesión con email correcto', async () => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue(usuarioBase)

    const user = await loginUser({ identifier: 'maria@example.com', password: 'Password123' })

    expect(mp.usuario.findUnique).toHaveBeenCalledWith({ where: { email: 'maria@example.com' } })
    expect(mp.voluntario.upsert).toHaveBeenCalledWith({
      where: { usuarioId: 'user-1' },
      update: {},
      create: { usuarioId: 'user-1' },
    })
    expect(user).toMatchObject({ id: 'user-1', email: 'maria@example.com' })
  })

  it('permite iniciar sesión con DNI convertido a mayusculas', async () => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue(usuarioBase)

    await loginUser({ identifier: '12345678a', password: 'Password123' })

    expect(mp.usuario.findUnique).toHaveBeenCalledWith({ where: { dni: '12345678A' } })
  })

  it('lanza error 401 si las credenciales son incorrectas', async () => {
    mockCompare.mockResolvedValue(false)
    mp.usuario.findUnique.mockResolvedValue(usuarioBase)

    await expect(
      loginUser({ identifier: 'maria@example.com', password: 'WrongPass' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
