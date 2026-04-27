import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

// TODO: Implementar en Mes 2
export async function puestosRouter(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    reply.send({ puestos: [] })
  })

  app.post('/', {
    preHandler: [requireAuth, requireRole('COORDINADOR', 'PUESTO_EMERGENCIA')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })
}
