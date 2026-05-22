import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'

const IDEMPOTENCY_HEADER = 'idempotency-key'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const RETENTION_MS = 24 * 60 * 60 * 1000

type IdempotentRequest = FastifyRequest & {
  idempotencyKey?: string
  idempotencyRecordCreated?: boolean
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}

function hashBody(body: unknown) {
  return createHash('sha256').update(stableStringify(body ?? null)).digest('hex')
}

function getHeaderValue(request: FastifyRequest) {
  const value = request.headers[IDEMPOTENCY_HEADER]
  return Array.isArray(value) ? value[0] : value
}

function normalizeUrl(request: FastifyRequest) {
  return request.url.split('?')[0]
}

function sendConflict(reply: FastifyReply, message: string) {
  return reply.status(409).send({
    code: 'IDEMPOTENCY_CONFLICT',
    error: message,
  })
}

export async function registerIdempotency(app: FastifyInstance) {
  app.addHook('preHandler', async (request: IdempotentRequest, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return

    const key = getHeaderValue(request)?.trim()
    if (!key) return
    if (key.length > 120) return sendConflict(reply, 'La clave de idempotencia es demasiado larga')

    const method = request.method
    const url = normalizeUrl(request)
    const bodyHash = hashBody(request.body)
    const expiresAt = new Date(Date.now() + RETENTION_MS)
    request.idempotencyKey = key

    const existing = await prisma.idempotencyRecord.findUnique({ where: { key } })
    if (!existing) {
      await prisma.idempotencyRecord.create({
        data: { key, method, url, bodyHash, expiresAt },
      })
      request.idempotencyRecordCreated = true
      return
    }

    if (existing.method !== method || existing.url !== url || existing.bodyHash !== bodyHash) {
      return sendConflict(reply, 'La clave de idempotencia ya se uso con otra operacion')
    }

    if (existing.status === 'COMPLETED' && existing.statusCode && existing.response !== null) {
      reply.header('x-idempotency-replayed', 'true')
      return reply.status(existing.statusCode).send(existing.response)
    }

    return sendConflict(reply, 'La operacion ya esta en proceso; reintentalo en unos segundos')
  })

  app.addHook('onSend', async (request: IdempotentRequest, _reply, payload) => {
    if (!request.idempotencyKey || !request.idempotencyRecordCreated) return payload

    const statusCode = _reply.statusCode
    if (statusCode < 200 || statusCode >= 300) {
      await prisma.idempotencyRecord.deleteMany({
        where: { key: request.idempotencyKey, status: 'PENDING' },
      })
      return payload
    }

    let response: unknown = null
    if (typeof payload === 'string' && payload.length > 0) {
      try {
        response = JSON.parse(payload)
      } catch {
        response = { raw: payload }
      }
    }

    await prisma.idempotencyRecord.updateMany({
      where: { key: request.idempotencyKey, status: 'PENDING' },
      data: {
        status: 'COMPLETED',
        statusCode,
        response: response ?? {},
      },
    })

    return payload
  })
}
