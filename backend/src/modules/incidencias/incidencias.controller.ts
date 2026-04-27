import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  createIncidenciaSchema,
  listIncidenciasQuerySchema,
  updateEstadoSchema,
} from './incidencias.schema.js'
import {
  createIncidencia,
  listIncidencias,
  updateIncidenciaEstado,
} from './incidencias.service.js'

export async function getIncidencias(request: FastifyRequest, reply: FastifyReply) {
  const query = listIncidenciasQuerySchema.parse(request.query)
  const incidencias = await listIncidencias(query)
  return reply.send({ incidencias })
}

export async function postIncidencia(request: FastifyRequest, reply: FastifyReply) {
  const input = createIncidenciaSchema.parse(request.body)
  const user = request.user as { sub?: string; id?: string } | undefined
  const reportanteId = user?.sub ?? user?.id

  const incidencia = await createIncidencia(input, reportanteId)
  return reply.status(201).send({ incidencia })
}

export async function patchIncidenciaEstado(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const input = updateEstadoSchema.parse(request.body)

  const incidencia = await updateIncidenciaEstado(id, input)
  return reply.send({ incidencia })
}
