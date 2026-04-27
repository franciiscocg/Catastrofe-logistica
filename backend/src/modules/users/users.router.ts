import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'

// TODO: Implementar en Mes 2
export async function usersRouter(app: FastifyInstance) {
  app.get('/:id', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({ message: 'Pendiente de implementar' })
  })
}
