import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { prisma } from '../../lib/prisma.js'
import { listTrabajadores, addTrabajador, removeTrabajador } from './trabajadores.service.js'

export async function puestosRouter(app: FastifyInstance) {
  // GET /api/puestos — listar puestos activos con contador de necesidades (público)
  app.get('/', async (_req, reply) => {
    const rows = await prisma.puestoEmergencia.findMany({
      where: { activo: true },
      select: {
        id: true, nombre: true, direccion: true,
        latitud: true, longitud: true, tipo: true,
        _count: {
          select: { inventario: { where: { tipo: 'NECESARIO' } } },
        },
      },
      orderBy: { nombre: 'asc' },
    })

    const puestos = rows.map((p) => ({
      id: p.id, nombre: p.nombre, direccion: p.direccion,
      latitud: p.latitud, longitud: p.longitud, tipo: p.tipo,
      necesidades: p._count.inventario,
    }))

    return reply.send({ puestos })
  })

  // GET /api/puestos/mio — puestos del usuario (como admin O como trabajador)
  app.get('/mio', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const userId = (req.user as { id: string }).id

    const [comoAdmin, comoTrabajador] = await Promise.all([
      prisma.puestoEmergencia.findMany({
        where: { adminId: userId },
        select: puestoSelect,
      }),
      prisma.puestoEmergencia.findMany({
        where: { trabajadores: { some: { usuarioId: userId } } },
        select: puestoSelect,
      }),
    ])

    // Combinar sin duplicados (un admin puede estar también en trabajadores)
    const adminIds = new Set(comoAdmin.map((p) => p.id))
    const puestos = [
      ...comoAdmin,
      ...comoTrabajador.filter((p) => !adminIds.has(p.id)),
    ]

    return reply.send({ puestos })
  })

  // GET /api/puestos/:id — detalle de un puesto concreto (público)
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const puesto = await prisma.puestoEmergencia.findUnique({
      where: { id },
      select: puestoSelect,
    })
    if (!puesto) return reply.status(404).send({ error: 'Puesto no encontrado' })
    return reply.send({ puesto })
  })

  // ── Trabajadores ────────────────────────────────────────────────────────────

  // GET /api/puestos/:id/trabajadores
  app.get('/:id/trabajadores', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const trabajadores = await listTrabajadores(id)
    return reply.send({ trabajadores })
  })

  // POST /api/puestos/:id/trabajadores — añadir por email
  app.post('/:id/trabajadores', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { email } = req.body as { email: string }
    if (!email) return reply.status(400).send({ error: 'El email es obligatorio' })
    const adminId = (req.user as { id: string }).id
    const trabajador = await addTrabajador(id, email, adminId)
    return reply.status(201).send({ trabajador })
  })

  // DELETE /api/puestos/:id/trabajadores/:userId — eliminar trabajador
  app.delete('/:id/trabajadores/:userId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    const adminId = (req.user as { id: string }).id
    await removeTrabajador(id, userId, adminId)
    return reply.status(204).send()
  })

  // POST /api/puestos — crear puesto (coordinador)
  app.post('/', {
    preHandler: [requireAuth, requireRole('COORDINADOR', 'PUESTO_EMERGENCIA')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })
}

const puestoSelect = {
  id: true, nombre: true, direccion: true,
  latitud: true, longitud: true, tipo: true, activo: true,
  catastrofe: { select: { id: true, nombre: true, fase: true } },
} as const
