import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // ZodError: el check instanceof falla a veces entre módulos; usamos el nombre
  if (error.name === 'ZodError') {
    let details: { field: string; message: string }[] = []
    try {
      // Fastify serializa el mensaje de ZodError como JSON de los issues
      const issues = JSON.parse(error.message) as Array<{ path: (string | number)[]; message: string }>
      details = issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    } catch {
      details = [{ field: 'general', message: error.message }]
    }
    return reply.status(400).send({ error: 'Datos inválidos', details })
  }

  if (error.statusCode === 429) {
    return reply.status(429).send({ error: 'Demasiadas peticiones. Inténtalo más tarde.' })
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ error: error.message })
  }

  request.log.error(error)
  return reply.status(500).send({ error: 'Error interno del servidor' })
}
