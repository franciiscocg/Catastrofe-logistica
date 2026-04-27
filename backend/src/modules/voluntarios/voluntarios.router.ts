import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

// TODO: Implementar en Mes 2
export async function voluntariosRouter(app: FastifyInstance) {
  app.post('/registro', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })
}
