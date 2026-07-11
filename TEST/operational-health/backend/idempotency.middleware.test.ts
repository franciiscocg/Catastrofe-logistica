import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const records = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: { idempotencyRecord: records },
}))

import { registerIdempotency } from '../../../backend/src/middleware/idempotency.middleware.js'

async function createApp(statusCode = 201) {
  const app = Fastify()
  await registerIdempotency(app)
  app.post('/resource', async (_request, reply) => reply.status(statusCode).send({ ok: statusCode < 400 }))
  return app
}

describe('middleware de idempotencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('guarda la respuesta satisfactoria para poder repetirla', async () => {
    records.findUnique.mockResolvedValue(null)
    records.create.mockResolvedValue({})
    records.updateMany.mockResolvedValue({ count: 1 })
    const app = await createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/resource',
      headers: { 'idempotency-key': 'operation-1' },
      payload: { b: 2, a: 1 },
    })

    expect(response.statusCode).toBe(201)
    expect(records.create).toHaveBeenCalledWith({ data: expect.objectContaining({ key: 'operation-1' }) })
    expect(records.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'COMPLETED', statusCode: 201, response: { ok: true } },
    }))
    await app.close()
  })

  it('reproduce una respuesta completada sin ejecutar de nuevo la ruta', async () => {
    records.findUnique.mockResolvedValue({
      key: 'operation-2', method: 'POST', url: '/resource',
      bodyHash: '74234e98afe7498fb5daf1f36ac2d78a95b8b8e8f6f5f7d8f1f0f3f6f6f6f6f6',
      status: 'COMPLETED', statusCode: 200, response: { cached: true },
    })
    const app = await createApp()
    // Primera consulta para obtener el hash real que genera el middleware.
    records.findUnique.mockResolvedValueOnce(null)
    records.create.mockResolvedValue({})
    records.updateMany.mockResolvedValue({ count: 1 })
    await app.inject({ method: 'POST', url: '/resource', headers: { 'idempotency-key': 'seed' } })
    const hash = records.create.mock.calls[0][0].data.bodyHash
    records.findUnique.mockResolvedValue({
      method: 'POST', url: '/resource', bodyHash: hash,
      status: 'COMPLETED', statusCode: 200, response: { cached: true },
    })

    const response = await app.inject({ method: 'POST', url: '/resource', headers: { 'idempotency-key': 'operation-2' } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['x-idempotency-replayed']).toBe('true')
    expect(response.json()).toEqual({ cached: true })
    await app.close()
  })

  it('elimina el registro pendiente cuando la operación falla', async () => {
    records.findUnique.mockResolvedValue(null)
    records.create.mockResolvedValue({})
    records.deleteMany.mockResolvedValue({ count: 1 })
    const app = await createApp(400)
    const response = await app.inject({ method: 'POST', url: '/resource', headers: { 'idempotency-key': 'operation-3' } })
    expect(response.statusCode).toBe(400)
    expect(records.deleteMany).toHaveBeenCalledWith({ where: { key: 'operation-3', status: 'PENDING' } })
    await app.close()
  })

  it('devuelve conflicto en vez de 500 si otra petición crea la clave simultáneamente', async () => {
    records.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        method: 'POST',
        url: '/resource',
        bodyHash: createHash('sha256').update('null').digest('hex'),
        status: 'PENDING',
      })
    records.create.mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }))
    const app = await createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/resource',
      headers: { 'idempotency-key': 'concurrent-operation' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await app.close()
  })
})
