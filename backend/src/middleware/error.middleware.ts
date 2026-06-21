import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

function getPrismaErrorMessage(error: FastifyError) {
  const code = (error as { code?: string }).code

  if (code === 'P2002') return 'Ya existe un registro con esos datos.'
  if (code === 'P2003') return 'La operación hace referencia a datos que no existen.'
  if (code === 'P2011') return 'La base de datos tiene una restricción obligatoria incompatible con el modelo actual.'
  if (code === 'P2025') return 'No se encontró el registro solicitado.'
  if (code === 'P2022') return 'La base de datos no está actualizada. Ejecuta las migraciones pendientes.'

  if (error.name?.startsWith('PrismaClient')) {
    return 'No se pudo completar la operación en la base de datos.'
  }

  return null
}

function getValidationDetails(error: FastifyError) {
  try {
    const issues = JSON.parse(error.message) as Array<{ path: (string | number)[]; message: string }>
    return issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
  } catch {
    return [{ field: 'general', message: error.message }]
  }
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: 'Datos inválidos',
      details: getValidationDetails(error),
    })
  }

  const prismaMessage = getPrismaErrorMessage(error)
  if (prismaMessage) {
    request.log.error(error)
    return reply.status(500).send({ error: prismaMessage })
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
