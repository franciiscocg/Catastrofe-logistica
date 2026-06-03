import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  createComentarioIncidenciaSchema,
  createIncidenciaSchema,
  listIncidenciasQuerySchema,
  updateEstadoSchema,
  updateIncidenciaSchema,
} from './incidencias.schema.js'
import {
  createAsignacionIncidencia,
  createComentarioIncidencia,
  createIncidencia,
  deleteIncidencia,
  finalizarAsignacionIncidencia,
  getAsignacionIncidenciaActiva,
  listAsignacionesIncidencia,
  listVoluntariosIncidenciaByCoordinator,
  removeVoluntarioIncidenciaByCoordinator,
  listIncidencias,
  updateIncidenciaEstado,
  updateIncidenciaByCoordinator,
} from './incidencias.service.js'
import { emitRealtime } from '../../lib/realtime.js'

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
    emitRealtime('incidencia:created', { incidenciaId: incidencia.id })
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
  emitRealtime('incidencia:updated', { incidenciaId: incidencia.id })
  return reply.send({ incidencia })
}

export async function deleteIncidenciaCoordinador(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const coordinadorId = getUsuarioId(request.user)
  if (!coordinadorId) return reply.status(401).send({ error: 'No autenticado' })

  await deleteIncidencia(id, coordinadorId)
  emitRealtime('incidencia:updated', { incidenciaId: id })
  return reply.status(204).send()
}

export async function patchIncidenciaCoordinador(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const coordinadorId = getUsuarioId(request.user)
  if (!coordinadorId) return reply.status(401).send({ error: 'No autenticado' })

  const input = updateIncidenciaSchema.parse(request.body)
  const incidencia = await updateIncidenciaByCoordinator(id, input, coordinadorId)
  emitRealtime('incidencia:updated', { incidenciaId: incidencia.id })
  return reply.send({ incidencia })
}

export async function getVoluntariosIncidenciaCoordinador(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }

  const voluntarios = await listVoluntariosIncidenciaByCoordinator(id)
  return reply.send({ voluntarios })
}

export async function deleteVoluntarioIncidenciaCoordinador(request: FastifyRequest, reply: FastifyReply) {
  const { id, asignacionId } = request.params as { id: string; asignacionId: string }
  const coordinadorId = getUsuarioId(request.user)
  if (!coordinadorId) return reply.status(401).send({ error: 'No autenticado' })

  await removeVoluntarioIncidenciaByCoordinator(id, asignacionId, coordinadorId)
  emitRealtime('incidencia:updated', { incidenciaId: id })
  return reply.status(204).send()
}

export async function postComentarioIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const input = createComentarioIncidenciaSchema.parse(request.body)
  const user = request.user as { sub?: string; id?: string } | undefined
  const autorId = user?.sub ?? user?.id

  const result = await createComentarioIncidencia(id, input, autorId)
  emitRealtime('incidencia:updated', { incidenciaId: result.incidencia.id })
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
  emitRealtime('incidencia:updated', { incidenciaId: id })
  return reply.status(201).send({ asignacion })
}

export async function postFinalizarAsignacionIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const usuarioId = getUsuarioId(request.user)
  if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

  const { id } = request.params as { id: string }
  const asignacion = await finalizarAsignacionIncidencia(usuarioId, id)
  emitRealtime('incidencia:updated', { incidenciaId: id })
  return reply.send({ asignacion })
}
