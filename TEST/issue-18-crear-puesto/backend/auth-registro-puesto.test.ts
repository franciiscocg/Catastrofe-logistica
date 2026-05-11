import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    usuario: {
      findUnique: vi.fn(),
      create:     vi.fn(),
    },
    solicitudPuesto: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) =>
      cb({
        usuario:        prismaMock.usuario,
        solicitudPuesto: prismaMock.solicitudPuesto,
      }),
    ),
  }
  return { prismaMock }
})

const { mockHash, mockCompare } = vi.hoisted(() => ({
  mockHash:    vi.fn(async (value: string) => `hashed:${value}`),
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

// ── registerUser ──────────────────────────────────────────────────────────────

describe('registerUser — registro normal (sin datos de puesto)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('crea el usuario con roles CIUDADANO y VOLUNTARIO', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1', email: 'maria@example.com',
      nombre: 'Maria', apellidos: 'Garcia', telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    })

    const result = await registerUser({
      email: 'maria@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
    })

    expect(result.puesto).toBeNull()
    expect(result.solicitud).toBeNull()
    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'maria@example.com',
        password: 'hashed:Password123',
        dni: '12345678A',
        roles: ['CIUDADANO', 'VOLUNTARIO'],
        activo: true,
      }),
    }))
  })

  it('normaliza el DNI a mayusculas al registrar', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1', email: 'maria@example.com',
      nombre: 'Maria', apellidos: 'Garcia', telefono: null,
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    })

    await registerUser({
      email: 'maria@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678a',
    })

    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dni: '12345678A' }),
    }))
  })

  it('lanza error 400 si el email ya esta registrado', async () => {
    mp.usuario.findUnique.mockResolvedValue({ id: 'existing-user' })

    await expect(registerUser({
      email: 'ya-existe@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/email/) })
  })

  it('lanza error 400 si el DNI ya esta registrado', async () => {
    // Primera findUnique (por email) devuelve null, segunda (por DNI) devuelve usuario
    mp.usuario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-user' })

    await expect(registerUser({
      email: 'nuevo@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
    })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/DNI/) })
  })
})

describe('registerUser — registro con datos de puesto', () => {
  const puestoInput = {
    nombre: 'CEIP La Paz', tipo: 'colegio',
    direccion: 'Calle Mayor 12', latitud: 39.4254, longitud: -0.4178,
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('crea usuario con rol PUESTO_EMERGENCIA (no CIUDADANO/VOLUNTARIO)', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1', email: 'puesto@example.com',
      nombre: 'Maria', apellidos: 'Garcia', telefono: '+34600000000',
      roles: ['PUESTO_EMERGENCIA'],
    })
    mp.solicitudPuesto.create.mockResolvedValue({ id: 'solicitud-1', nombre: 'CEIP La Paz', estado: 'PENDIENTE' })

    const result = await registerUser({
      email: 'puesto@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
      telefono: '+34600000000', puesto: puestoInput,
    })

    expect(mp.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roles: ['PUESTO_EMERGENCIA'] }),
    }))
    // No se asignan los roles de ciudadano/voluntario
    expect(mp.usuario.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roles: ['CIUDADANO', 'VOLUNTARIO'] }),
    }))
    expect(result.user.roles).toEqual(['PUESTO_EMERGENCIA'])
  })

  it('crea una SolicitudPuesto PENDIENTE — NO crea PuestoEmergencia directamente', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1', email: 'puesto@example.com',
      nombre: 'Maria', apellidos: 'Garcia', telefono: '+34600000000',
      roles: ['PUESTO_EMERGENCIA'],
    })
    mp.solicitudPuesto.create.mockResolvedValue({
      id: 'solicitud-1', nombre: 'CEIP La Paz', estado: 'PENDIENTE',
    })

    const result = await registerUser({
      email: 'puesto@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
      telefono: '+34600000000', puesto: puestoInput,
    })

    // El resultado tiene solicitud pero puesto=null (no hay PuestoEmergencia activo todavia)
    expect(result.solicitud).toMatchObject({ id: 'solicitud-1', estado: 'PENDIENTE' })
    expect(result.puesto).toBeNull()

    expect(mp.solicitudPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        usuarioId: 'user-1',
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        latitud: 39.4254,
        longitud: -0.4178,
      }),
    }))
  })

  it('incluye descripcion en la solicitud si se proporciona', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)
    mp.usuario.create.mockResolvedValue({
      id: 'user-1', email: 'puesto@example.com',
      nombre: 'Maria', apellidos: 'Garcia', telefono: null,
      roles: ['PUESTO_EMERGENCIA'],
    })
    mp.solicitudPuesto.create.mockResolvedValue({ id: 'solicitud-1', estado: 'PENDIENTE' })

    await registerUser({
      email: 'puesto@example.com', password: 'Password123',
      nombre: 'Maria', apellidos: 'Garcia', dni: '12345678A',
      puesto: { ...puestoInput, descripcion: 'Aula de apoyo escolar' },
    })

    expect(mp.solicitudPuesto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ descripcion: 'Aula de apoyo escolar' }),
    }))
  })
})

// ── loginUser ─────────────────────────────────────────────────────────────────

describe('loginUser', () => {
  const usuarioBase = {
    id: 'user-1', email: 'maria@example.com', password: 'hashed:Password123',
    nombre: 'Maria', apellidos: 'Garcia', telefono: null,
    roles: ['CIUDADANO', 'VOLUNTARIO'], activo: true,
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('permite iniciar sesion con email correcto', async () => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue(usuarioBase)

    const user = await loginUser({ identifier: 'maria@example.com', password: 'Password123' })

    expect(mp.usuario.findUnique).toHaveBeenCalledWith({ where: { email: 'maria@example.com' } })
    expect(user).toMatchObject({ id: 'user-1', email: 'maria@example.com' })
  })

  it('permite iniciar sesion con DNI (convertido a mayusculas)', async () => {
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

  it('lanza error 401 si el usuario no existe', async () => {
    mp.usuario.findUnique.mockResolvedValue(null)

    await expect(
      loginUser({ identifier: 'noexiste@example.com', password: 'Password123' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('lanza error 403 si la cuenta esta desactivada', async () => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue({ ...usuarioBase, activo: false })

    await expect(
      loginUser({ identifier: 'maria@example.com', password: 'Password123' }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('el token no incluye la password del usuario en la respuesta', async () => {
    mockCompare.mockResolvedValue(true)
    mp.usuario.findUnique.mockResolvedValue(usuarioBase)

    const user = await loginUser({ identifier: 'maria@example.com', password: 'Password123' })

    expect(user).not.toHaveProperty('password')
  })
})
