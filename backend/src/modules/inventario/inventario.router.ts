import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

const tipoInventario = {
  DISPONIBLE: 'disponible',
  NECESARIO: 'necesario',
} as const

export async function inventarioRouter(app: FastifyInstance) {
  app.get('/puesto/:puestoId', async (request, reply) => {
    const { puestoId } = request.params as { puestoId: string }
    const inventario = await prisma.inventario.findMany({
      where: { puestoId },
      orderBy: [{ tipo: 'desc' }, { producto: { nombre: 'asc' } }],
      include: { producto: true },
    })

    reply.send({
      inventario: inventario.map((item) => ({
        id: item.id,
        puestoId: item.puestoId,
        producto: item.producto,
        cantidad: item.cantidad,
        tipo: tipoInventario[item.tipo],
        updatedAt: item.updatedAt,
      })),
    })
  })

  app.put('/puesto/:puestoId/producto/:productoId', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA', 'COORDINADOR')],
  }, async (_req, reply) => {
    reply.send({ message: 'Pendiente de implementar' })
  })
}
