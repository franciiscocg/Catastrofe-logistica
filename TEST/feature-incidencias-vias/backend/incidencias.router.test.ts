import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from '../../../backend/node_modules/fastify/fastify.js'
import jwt from '../../../backend/node_modules/@fastify/jwt/jwt.js'
import { errorHandler } from '../../../backend/src/middleware/error.middleware.js'

const { createComentarioIncidenciaMock } = vi.hoisted(() => ({
  createComentarioIncidenciaMock: vi.fn(),
}))

vi.mock('../../../backend/src/modules/incidencias/incidencias.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../../backend/src/modules/incidencias/incidencias.service.js')>(
    '../../../backend/src/modules/incidencias/incidencias.service.js',
  )
  return {
    ...actual,
    createComentarioIncidencia: createComentarioIncidenciaMock,
  }
})

import { incidenciasRouter } from '../../../backend/src/modules/incidencias/incidencias.router.js'

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: 'test-secret' })
  app.setErrorHandler(errorHandler)
  await app.register(incidenciasRouter, { prefix: '/api/incidencias' })
  return app
}

describe('incidenciasRouter comentarios', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rechaza actualizar el estado mediante comentario sin autenticacion', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/incidencias/inc-1/comentarios',
      payload: { estado: 'TRANSITABLE', comentario: 'La calle esta despejada' },
    })

    expect(response.statusCode).toBe(401)
    expect(createComentarioIncidenciaMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('permite que un usuario autenticado actualice el estado mediante comentario', async () => {
    const app = await buildTestApp()
    const token = app.jwt.sign({
      sub: 'user-1',
      id: 'user-1',
      email: 'usuario@example.com',
      roles: ['CIUDADANO'],
    })
    createComentarioIncidenciaMock.mockResolvedValue({
      comentario: { id: 'com-1', estado: 'TRANSITABLE', comentario: 'La calle esta despejada' },
      incidencia: { id: 'inc-1', estado: 'TRANSITABLE' },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/incidencias/inc-1/comentarios',
      headers: { authorization: `Bearer ${token}` },
      payload: { estado: 'TRANSITABLE', comentario: 'La calle esta despejada' },
    })

    expect(response.statusCode).toBe(201)
    expect(createComentarioIncidenciaMock).toHaveBeenCalledWith(
      'inc-1',
      { estado: 'TRANSITABLE', comentario: 'La calle esta despejada' },
      'user-1',
    )
    await app.close()
  })
})
