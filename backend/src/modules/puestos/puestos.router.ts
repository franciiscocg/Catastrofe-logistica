import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

function getUsuarioId(user: unknown) {
  const authUser = user as { sub?: string; id?: string } | undefined
  return authUser?.sub ?? authUser?.id
}

async function getVoluntarioByUsuario(usuarioId: string) {
  const voluntario = await prisma.voluntario.findUnique({
    where: { usuarioId },
    select: { id: true },
  })

  if (!voluntario) throw badRequest('El usuario no tiene perfil de voluntario')
  return voluntario
}

function formatPuesto(puesto: {
  id: string
  nombre: string
  descripcion: string | null
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
  capacidadTrabajo: number
  catastrofeId: string
  _count: { asignacionesVoluntarios: number }
}) {
  return {
    id: puesto.id,
    nombre: puesto.nombre,
    descripcion: puesto.descripcion,
    direccion: puesto.direccion,
    latitud: puesto.latitud,
    longitud: puesto.longitud,
    tipo: puesto.tipo,
    activo: puesto.activo,
    capacidadTrabajo: puesto.capacidadTrabajo,
    voluntariosTrabajando: puesto._count.asignacionesVoluntarios,
    catastrofeId: puesto.catastrofeId,
  }
}

export async function puestosRouter(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    const puestos = await prisma.puestoEmergencia.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        _count: {
          select: {
            asignacionesVoluntarios: { where: { estado: 'ACTIVA' } },
          },
        },
      },
    })

    reply.send({ puestos: puestos.map(formatPuesto) })
  })

  app.get('/mis-asignaciones/activa', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const voluntario = await getVoluntarioByUsuario(usuarioId)
    const asignacion = await prisma.asignacionPuesto.findFirst({
      where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
      orderBy: { startedAt: 'desc' },
      include: {
        puesto: true,
      },
    })

    reply.send({ asignacion })
  })

  app.get('/mis-asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const voluntario = await getVoluntarioByUsuario(usuarioId)
    const asignaciones = await prisma.asignacionPuesto.findMany({
      where: { voluntarioId: voluntario.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: { puesto: true },
    })

    reply.send({ asignaciones })
  })

  app.post('/:id/asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const { id: puestoId } = request.params as { id: string }
    const voluntario = await getVoluntarioByUsuario(usuarioId)

    const asignacion = await prisma.$transaction(async (tx) => {
      const donacionActiva = await tx.donacion.findFirst({
        where: {
          voluntarioId: voluntario.id,
          estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
        },
        select: { id: true },
      })

      if (donacionActiva) {
        throw badRequest('Ya tienes una donacion activa. Finalizala o cancelala antes de ayudar en un puesto.')
      }

      const asignacionActiva = await tx.asignacionPuesto.findFirst({
        where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
        include: { puesto: true },
      })

      if (asignacionActiva) {
        if (asignacionActiva.puestoId === puestoId) return asignacionActiva
        throw badRequest(`Ya estas ayudando en ${asignacionActiva.puesto.nombre}. Termina esa tarea antes de elegir otro puesto.`)
      }

      const puesto = await tx.puestoEmergencia.findFirst({
        where: { id: puestoId, activo: true },
        select: { id: true, capacidadTrabajo: true },
      })
      if (!puesto) throw notFound('Puesto no encontrado')

      const trabajando = await tx.asignacionPuesto.count({
        where: { puestoId, estado: 'ACTIVA' },
      })

      if (trabajando >= puesto.capacidadTrabajo) {
        throw badRequest('Este puesto esta lleno ahora mismo.')
      }

      return tx.asignacionPuesto.create({
        data: {
          voluntarioId: voluntario.id,
          puestoId,
        },
        include: { puesto: true },
      })
    })

    reply.status(201).send({ asignacion })
  })

  app.post('/:id/asignaciones/finalizar', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const { id: puestoId } = request.params as { id: string }
    const voluntario = await getVoluntarioByUsuario(usuarioId)

    const asignacion = await prisma.asignacionPuesto.findFirst({
      where: { voluntarioId: voluntario.id, puestoId, estado: 'ACTIVA' },
      select: { id: true },
    })

    if (!asignacion) throw notFound('No tienes una asignacion activa en este puesto')

    const finalizada = await prisma.asignacionPuesto.update({
      where: { id: asignacion.id },
      data: {
        estado: 'FINALIZADA',
        endedAt: new Date(),
      },
      include: { puesto: true },
    })

    reply.send({ asignacion: finalizada })
  })

  app.post('/', {
    preHandler: [requireAuth, requireRole('COORDINADOR', 'PUESTO_EMERGENCIA')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })
}
