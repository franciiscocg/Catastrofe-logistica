import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { createDonacionSchema, updateDonacionEstadoSchema } from './donaciones.schema.js'
import {
  createDonacion,
  generarCodigoEntrega,
  listMisDonaciones,
  listNecesidadesDonacion,
  updateDonacionEstado,
} from './donaciones.service.js'

function getUsuarioId(user: unknown) {
  const authUser = user as { sub?: string; id?: string } | undefined
  return authUser?.sub ?? authUser?.id
}

export async function donacionesRouter(app: FastifyInstance) {
  app.get('/necesidades', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (_request, reply) => {
    const necesidades = await listNecesidadesDonacion()
    return reply.send({ necesidades })
  })

  app.get('/mis-donaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const donaciones = await listMisDonaciones(usuarioId)
    return reply.send({ donaciones })
  })

  app.post('/', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const input = createDonacionSchema.parse(request.body)
    const donacion = await createDonacion(usuarioId, input)
    return reply.status(201).send({ donacion })
  })

  app.patch('/:id/estado', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const { id } = request.params as { id: string }
    const input = updateDonacionEstadoSchema.parse(request.body)
    const donacion = await updateDonacionEstado(usuarioId, id, input.estado)
    return reply.send({ donacion })
  })

  app.post('/:id/codigo-entrega', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const { id } = request.params as { id: string }
    const donacion = await generarCodigoEntrega(usuarioId, id)
    return reply.send({ donacion })
  })
}
