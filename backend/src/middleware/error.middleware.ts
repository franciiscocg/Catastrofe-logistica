import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Datos inválidos',
      details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    })
  }

  if (error.statusCode === 429) {
    return reply.status(429).send({ error: 'Demasiadas peticiones. Inténtalo más tarde.' })
  }

  if (error.statusCode) {
    return reply.status(error.statusCode).send({ error: error.message })
  }

  request.log.error(error)
  return reply.status(500).send({ error: 'Error interno del servidor' })
}
