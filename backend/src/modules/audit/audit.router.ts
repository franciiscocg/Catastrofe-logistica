import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  getEventsByEntidad,
  getEventById,
  getRecentEvents,
  getChainStats,
  verifyChain,
} from './audit.service.js'

export async function auditRouter(app: FastifyInstance) {
  // GET /api/public/audit/stats
  app.get('/stats', async (_req, reply) => {
    const stats = await getChainStats()
    return reply.send(stats)
  })

  // GET /api/public/audit/verify  — full chain integrity check, coalesced and cached briefly
  app.get('/verify', async (_req, reply) => {
    const result = await verifyChain()
    return reply.send(result)
  })

  // GET /api/public/audit/recent?limit=50
  app.get('/recent', async (req, reply) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query)
    const events = await getRecentEvents(limit)
    return reply.send(events)
  })

  // GET /api/public/audit/donacion/:id
  app.get('/donacion/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const events = await getEventsByEntidad('donacion', id)
    if (events.length === 0) return reply.status(404).send({ error: 'No se encontraron eventos para esta donación' })
    return reply.send({ entidadId: id, entidad: 'donacion', events })
  })

  // GET /api/public/audit/inventario/:puestoId
  app.get('/inventario/:puestoId', async (req, reply) => {
    const { puestoId } = req.params as { puestoId: string }
    const events = await getEventsByEntidad('inventario', puestoId)
    return reply.send({ entidadId: puestoId, entidad: 'inventario', events })
  })

  // GET /api/public/audit/event/:id  — single event with TSA token
  app.get('/event/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const event = await getEventById(id)
    if (!event) return reply.status(404).send({ error: 'Evento no encontrado' })
    return reply.send(event)
  })
}
