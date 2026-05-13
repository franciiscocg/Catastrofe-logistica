import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { addItemSchema, updateCantidadSchema } from './inventario.schema.js'
import { listInventario, listInventarioHistorial, addItem, updateCantidad, deleteItem } from './inventario.service.js'

export async function inventarioRouter(app: FastifyInstance) {
  app.get('/puesto/:puestoId', async (req, reply) => {
    const { puestoId } = req.params as { puestoId: string }
    const inventario = await listInventario(puestoId)
    return reply.send({ inventario })
  })

  app.get('/puesto/:puestoId/historial', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { puestoId } = req.params as { puestoId: string }
    const userId = (req.user as { id: string }).id
    const historial = await listInventarioHistorial(puestoId, userId)
    return reply.send({ historial })
  })

  app.post('/puesto/:puestoId/items', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { puestoId } = req.params as { puestoId: string }
    const input = addItemSchema.parse(req.body)
    const userId = (req.user as { id: string }).id
    const item = await addItem(puestoId, input, userId)
    return reply.status(201).send({ item })
  })

  app.patch('/items/:itemId/cantidad', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }
    const input = updateCantidadSchema.parse(req.body)
    const userId = (req.user as { id: string }).id
    const item = await updateCantidad(itemId, input, userId)
    return reply.send({ item })
  })

  app.delete('/items/:itemId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }
    const userId = (req.user as { id: string }).id
    await deleteItem(itemId, userId)
    return reply.status(204).send()
  })
}
