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

function translateValidationMessage(message: string) {
  const text = message.trim()
  if (!text) return 'El valor no es válido.'
  if (/^required$/i.test(text)) return 'Este campo es obligatorio.'
  if (/invalid email/i.test(text)) return 'El email no tiene un formato válido.'
  if (/invalid enum value/i.test(text)) return 'El valor seleccionado no es válido.'
  if (/expected .*received undefined/i.test(text)) return 'Este campo es obligatorio.'
  if (/expected string/i.test(text)) return 'Debe ser un texto válido.'
  if (/expected number/i.test(text)) return 'Debe ser un número válido.'
  if (/expected boolean/i.test(text)) return 'Debe ser verdadero o falso.'
  if (/expected array/i.test(text)) return 'Debe ser una lista válida.'
  if (/string must contain at least/i.test(text)) return 'El texto no tiene la longitud mínima requerida.'
  if (/string must contain at most/i.test(text)) return 'El texto supera la longitud máxima permitida.'
  if (/number must be greater than/i.test(text)) return 'El número debe ser mayor.'
  if (/number must be less than/i.test(text)) return 'El número debe ser menor.'
  if (/unrecognized key/i.test(text)) return 'La petición incluye campos no permitidos.'
  return text
}

function translateHttpErrorMessage(message: string) {
  const text = message.trim()
  if (!text) return 'No se pudo completar la operación.'
  if (/^bad request$/i.test(text)) return 'La petición no es válida. Revisa los datos e inténtalo de nuevo.'
  if (/^unauthorized$/i.test(text)) return 'Tu sesión ha caducado. Inicia sesión de nuevo.'
  if (/^forbidden$/i.test(text)) return 'No tienes permiso para realizar esta acción.'
  if (/^not found$/i.test(text)) return 'No se encontró el recurso solicitado.'
  if (/payload too large/i.test(text)) return 'El contenido enviado es demasiado grande.'
  if (/unsupported media type/i.test(text)) return 'El formato de la petición no es compatible.'
  if (/request timeout/i.test(text)) return 'La petición ha tardado demasiado. Inténtalo de nuevo.'
  if (/invalid json/i.test(text)) return 'El cuerpo de la petición no contiene JSON válido.'
  return text
}

function getValidationDetails(error: FastifyError) {
  try {
    const issues = JSON.parse(error.message) as Array<{ path: (string | number)[]; message: string }>
    return issues.map((issue) => ({
      field: issue.path.join('.'),
      message: translateValidationMessage(issue.message),
    }))
  } catch {
    return [{ field: 'general', message: translateValidationMessage(error.message) }]
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
    return reply.status(error.statusCode).send({ error: translateHttpErrorMessage(error.message) })
  }

  request.log.error(error)
  return reply.status(500).send({ error: 'Error interno del servidor' })
}
