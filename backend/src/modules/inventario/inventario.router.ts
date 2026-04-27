import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

// TODO: Implementar en Mes 2
export async function inventarioRouter(app: FastifyInstance) {
  app.get('/puesto/:puestoId', async (_req, reply) => {
    reply.send({ inventario: [] })
  })

  app.put('/puesto/:puestoId/producto/:productoId', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA', 'COORDINADOR')],
  }, async (_req, reply) => {
    reply.send({ message: 'Pendiente de implementar' })
  })
}
