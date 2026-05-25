import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    usuario: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    voluntario: {
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      usuario: prismaMock.usuario,
      voluntario: prismaMock.voluntario,
      auditLog: prismaMock.auditLog,
    })),
  }
  return { prismaMock }
})

vi.mock('../../../backend/src/middleware/auth.middleware.js', () => ({
  requireAuth: vi.fn(async (request) => {
    request.user = { id: 'user-1', sub: 'user-1', roles: ['CIUDADANO', 'VOLUNTARIO'] }
  }),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({ prisma: prismaMock }))

import { usersRouter } from '../../../backend/src/modules/users/users.router.js'
import { voluntariosRouter } from '../../../backend/src/modules/voluntarios/voluntarios.router.js'
import { errorHandler } from '../../../backend/src/middleware/error.middleware.js'

async function buildApp() {
  const app = Fastify()
  app.setErrorHandler(errorHandler)
  await app.register(usersRouter, { prefix: '/api/users' })
  await app.register(voluntariosRouter, { prefix: '/api/voluntarios' })
  return app
}

describe('perfil de usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normaliza telefono y audita los campos modificados', async () => {
    const app = await buildApp()
    prismaMock.usuario.update.mockResolvedValue({
      id: 'user-1',
      email: 'ana@example.com',
      nombre: 'Ana',
      apellidos: 'Garcia',
      telefono: '+34600111222',
      roles: ['CIUDADANO', 'VOLUNTARIO'],
      emailVerified: true,
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { nombre: '  Ana  ', telefono: '+34 600-111-222' },
    })

    expect(response.statusCode).toBe(200)
    expect(prismaMock.usuario.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { nombre: 'Ana', telefono: '+34600111222' },
    }))
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accion: 'ACTUALIZAR_PERFIL_USUARIO',
        datos: { camposActualizados: ['nombre', 'telefono'] },
      }),
    }))
    await app.close()
  })

  it('rechaza telefonos no validos y campos no editables', async () => {
    const app = await buildApp()
    const invalidPhone = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { telefono: '123' },
    })
    const invalidField = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { email: 'nuevo@example.com' },
    })

    expect(invalidPhone.statusCode).toBe(400)
    expect(invalidField.statusCode).toBe(400)
    expect(prismaMock.usuario.update).not.toHaveBeenCalled()
    await app.close()
  })
})

describe('perfil operativo de voluntario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normaliza datos del vehiculo y registra auditoria', async () => {
    const app = await buildApp()
    prismaMock.voluntario.upsert.mockResolvedValue({
      id: 'vol-1',
      usuarioId: 'user-1',
      modalidad: 'transporte',
      vehiculo: { disponible: true, tipo: 'Furgoneta', matricula: '1234ABC', capacidad: '800 kg' },
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/voluntarios/me',
      payload: {
        modalidad: 'transporte',
        vehiculo: { disponible: true, tipo: 'Furgoneta', matricula: '1234abc', capacidad: '800 kg' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(prismaMock.voluntario.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        modalidad: 'transporte',
        vehiculo: expect.objectContaining({ matricula: '1234ABC' }),
      }),
    }))
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'ACTUALIZAR_PERFIL_VOLUNTARIO', entidadId: 'vol-1' }),
    }))
    await app.close()
  })

  it('rechaza modalidades desconocidas y vehiculos sin identificador', async () => {
    const app = await buildApp()
    const invalidMode = await app.inject({
      method: 'PATCH',
      url: '/api/voluntarios/me',
      payload: { modalidad: 'teletransporte' },
    })
    const missingVehicleData = await app.inject({
      method: 'PATCH',
      url: '/api/voluntarios/me',
      payload: { vehiculo: { disponible: true, tipo: 'Furgoneta' } },
    })

    expect(invalidMode.statusCode).toBe(400)
    expect(missingVehicleData.statusCode).toBe(400)
    expect(prismaMock.voluntario.upsert).not.toHaveBeenCalled()
    await app.close()
  })
})
