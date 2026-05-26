import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { emitInventoryEvents, emitRealtime } from '../../lib/realtime.js'
import { addItemSchema, confirmarQrSchema, updateCantidadSchema } from './inventario.schema.js'
import { listInventario, listInventarioHistorial, addItem, updateCantidad, deleteItem, confirmarQrInventario, getEstadoSolicitudQr } from './inventario.service.js'

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
    emitInventoryEvents(puestoId, item)
    return reply.status(201).send({ item })
  })

  app.post('/puesto/:puestoId/confirmar-qr', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { puestoId } = req.params as { puestoId: string }
    const input = confirmarQrSchema.parse(req.body)
    const userId = (req.user as { id: string }).id
    const result = await confirmarQrInventario(puestoId, input, userId)
    if ('productos' in result && Array.isArray(result.productos)) {
      result.productos.forEach((item) => emitInventoryEvents(puestoId, item))
    }
    if ('donacion' in result && result.donacion) {
      emitRealtime('donacion:updated', { donacionId: result.donacion.id, puestoId })
    }
    return reply.send(result)
  })

  app.get('/qr-solicitudes/:requestId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { requestId } = req.params as { requestId: string }
    const estado = await getEstadoSolicitudQr(requestId)
    return reply.send(estado)
  })

  app.patch('/items/:itemId/cantidad', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }
    const input = updateCantidadSchema.parse(req.body)
    const userId = (req.user as { id: string }).id
    const item = await updateCantidad(itemId, input, userId)
    emitInventoryEvents(item.puestoId, item)
    return reply.send({ item })
  })

  app.delete('/items/:itemId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { itemId } = req.params as { itemId: string }
    const userId = (req.user as { id: string }).id
    const item = await deleteItem(itemId, userId)
    emitRealtime('inventario:updated', { puestoId: item.puestoId, itemId, deleted: true })
    return reply.status(204).send()
  })
}
