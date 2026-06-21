import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    usuario: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    voluntario: {
      create: vi.fn(),
      upsert: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation({
        usuario: {
          create: prismaMock.usuario.create,
        },
        voluntario: {
          create: prismaMock.voluntario.create,
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
import { loginUser, registerUser, requestPasswordReset } from '../../../backend/src/modules/auth/auth.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any
const PASSWORD_HASH = '$2a$12$CWU2PWH3aCQqnwskDa.I9uwQSsjCbrzy9uhVfMD0txvaLdOjwwR0u'
const RECOVERY_CODE = 'codigo-recuperacion-seguro-123'
const RECOVERY_HASH = createHash('sha256').update(RECOVERY_CODE).digest('hex')

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['email', 'maria@example.com', { email: 'maria@example.com' }],
    ['dni', '12345678a', { dni: '12345678A' }],
  ])('permite iniciar sesión con %s', async (_tipo, identifier, where) => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'maria@example.com',
      password: PASSWORD_HASH,
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      activo: true,
    })

    const user = await loginUser({ identifier, password: 'Password123' })

    expect(mp.usuario.findUnique).toHaveBeenCalledWith({ where })
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

    expect(result.user.roles).toEqual(['CIUDADANO', 'VOLUNTARIO'])
    expect(result.recoveryCode).toHaveLength(24)
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        password: expect.any(String),
        dni: '12345678A',
        roles: ['CIUDADANO', 'VOLUNTARIO'],
        activo: true,
        emailVerified: false,
        emailVerifiedAt: null,
        recoveryCodeHash: expect.any(String),
      }),
    }))
    expect(mp.voluntario.create).toHaveBeenCalledWith({
      data: { usuarioId: 'user-1' },
    })
  })

  it('cambia la contraseña con el código de recuperación y revoca las sesiones', async () => {
    mp.usuario.findFirst.mockResolvedValue({ id: 'user-1', recoveryCodeHash: RECOVERY_HASH })
    mp.usuario.update.mockResolvedValue({ id: 'user-1' })
    mp.refreshToken.updateMany.mockResolvedValue({ count: 2 })

    await expect(requestPasswordReset({
      email: ' MARIA@EXAMPLE.COM ',
      dni: '12345678a',
      recoveryCode: RECOVERY_CODE,
      password: 'NuevaPassword123',
    })).resolves.toEqual({ ok: true })

    expect(mp.usuario.findFirst).toHaveBeenCalledWith({
      where: {
        email: 'maria@example.com',
        dni: '12345678A',
        activo: true,
      },
    })
    expect(mp.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        password: expect.any(String),
      }),
    })
    expect(mp.usuario.update.mock.calls[0][0].data.password).not.toBe('NuevaPassword123')
    expect(mp.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })

  it('rechaza la recuperación cuando el código secreto no coincide', async () => {
    mp.usuario.findFirst.mockResolvedValue({ id: 'user-1', recoveryCodeHash: RECOVERY_HASH })

    await expect(requestPasswordReset({
      email: 'maria@example.com',
      dni: '00000000A',
      recoveryCode: 'codigo-recuperacion-incorrecto',
      password: 'NuevaPassword123',
    })).rejects.toMatchObject({
      message: 'Los datos o el código de recuperación no son válidos',
      statusCode: 400,
    })
    expect(mp.usuario.update).not.toHaveBeenCalled()
  })

  it('ignora datos legacy de puesto durante el registro unificado', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1',
      email: 'puesto@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      telefono: '+34600000000',
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    })

    const result = await registerUser(({
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
    }) as Parameters<typeof registerUser>[0] & { puesto: unknown })

    expect(result.user.roles).toEqual(['CIUDADANO', 'VOLUNTARIO'])
    expect(mp.voluntario.create).toHaveBeenCalledWith({ data: { usuarioId: 'user-1' } })
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roles: ['CIUDADANO', 'VOLUNTARIO'] }),
    }))
  })
})
