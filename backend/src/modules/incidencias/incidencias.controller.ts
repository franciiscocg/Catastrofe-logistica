import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  createComentarioIncidenciaSchema,
  createIncidenciaSchema,
  listIncidenciasQuerySchema,
  updateEstadoSchema,
} from './incidencias.schema.js'
import {
  createAsignacionIncidencia,
  createComentarioIncidencia,
  createIncidencia,
  finalizarAsignacionIncidencia,
  getAsignacionIncidenciaActiva,
  listAsignacionesIncidencia,
  listIncidencias,
  updateIncidenciaEstado,
} from './incidencias.service.js'

function getUsuarioId(user: unknown) {
  const authUser = user as { sub?: string; id?: string } | undefined
  return authUser?.sub ?? authUser?.id
}

export async function getIncidencias(request: FastifyRequest, reply: FastifyReply) {
  const query = listIncidenciasQuerySchema.parse(request.query)
  const incidencias = await listIncidencias(query)
  return reply.send({ incidencias })
}

export async function postIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const input = createIncidenciaSchema.parse(request.body)
  const user = request.user as { sub?: string; id?: string } | undefined
  const reportanteId = user?.sub ?? user?.id

  try {
    const incidencia = await createIncidencia(input, reportanteId)
    return reply.status(201).send({ incidencia })
  } catch (error) {
    const duplicateError = error as Error & {
      statusCode?: number
      duplicateIncidencia?: {
        id: string
        latitud: number
        longitud: number
        estado: 'CORTADA' | 'TRANSITABLE'
        descripcion: string | null
        createdAt: Date
      }
    }

    if (duplicateError.statusCode === 409 && duplicateError.duplicateIncidencia) {
      return reply.status(409).send({
        error: duplicateError.message,
        code: 'INCIDENCIA_DUPLICADA_CERCANA',
        duplicateIncidencia: duplicateError.duplicateIncidencia,
      })
    }

    throw error
  }
}

export async function patchIncidenciaEstado(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const input = updateEstadoSchema.parse(request.body)

  const incidencia = await updateIncidenciaEstado(id, input)
  return reply.send({ incidencia })
}

export async function postComentarioIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const input = createComentarioIncidenciaSchema.parse(request.body)
  const user = request.user as { sub?: string; id?: string } | undefined
  const autorId = user?.sub ?? user?.id

  const result = await createComentarioIncidencia(id, input, autorId)
  return reply.status(201).send(result)
}

export async function getMiAsignacionIncidenciaActiva(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = getUsuarioId(request.user)
  if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

  const asignacion = await getAsignacionIncidenciaActiva(usuarioId)
  return reply.send({ asignacion })
}

export async function getMisAsignacionesIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = getUsuarioId(request.user)
  if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

  const asignaciones = await listAsignacionesIncidencia(usuarioId)
  return reply.send({ asignaciones })
}

export async function postAsignacionIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = getUsuarioId(request.user)
  if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

  const { id } = request.params as { id: string }
  const asignacion = await createAsignacionIncidencia(usuarioId, id)
  return reply.status(201).send({ asignacion })
}

export async function postFinalizarAsignacionIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = getUsuarioId(request.user)
  if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

  const { id } = request.params as { id: string }
  const asignacion = await finalizarAsignacionIncidencia(usuarioId, id)
  return reply.send({ asignacion })
}
