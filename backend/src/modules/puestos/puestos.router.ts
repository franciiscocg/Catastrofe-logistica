import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { RolUsuario } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { listTrabajadores, addTrabajador, removeTrabajador } from './trabajadores.service.js'

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
  _count: { asignacionesVoluntarios: number; inventario: number }
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
    necesidades: puesto._count.inventario,
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
            inventario: { where: { tipo: 'NECESARIO' } },
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
      include: { puesto: true },
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

    const adminIds = new Set(comoAdmin.map((p) => p.id))
    const puestos = [
      ...comoAdmin,
      ...comoTrabajador.filter((p) => !adminIds.has(p.id)),
    ]

    return reply.send({ puestos })
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

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const puesto = await prisma.puestoEmergencia.findUnique({
      where: { id },
      select: puestoSelect,
    })
    if (!puesto) return reply.status(404).send({ error: 'Puesto no encontrado' })
    return reply.send({ puesto })
  })

  app.get('/:id/trabajadores', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const trabajadores = await listTrabajadores(id)
    return reply.send({ trabajadores })
  })

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

  app.delete('/:id/trabajadores/:userId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    const adminId = (req.user as { id: string }).id
    await removeTrabajador(id, userId, adminId)
    return reply.status(204).send()
  })

  app.post('/', {
    preHandler: [requireAuth, requireRole('COORDINADOR', 'PUESTO_EMERGENCIA')],
  }, async (_req, reply) => {
    reply.status(201).send({ message: 'Pendiente de implementar' })
  })

  // Estado de la solicitud del usuario autenticado
  app.get('/mi-solicitud', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const puesto = await prisma.puestoEmergencia.findFirst({
      where: { adminId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        direccion: true,
        activo: true,
        estadoSolicitud: true,
        motivoRechazo: true,
        createdAt: true,
      },
    })
    return reply.send({ puesto })
  })

  // Puestos pendientes de aprobación (coordinador)
  app.get('/pendientes', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (_req, reply) => {
    const puestos = await prisma.puestoEmergencia.findMany({
      where: { estadoSolicitud: 'PENDIENTE' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        direccion: true,
        descripcion: true,
        latitud: true,
        longitud: true,
        createdAt: true,
        admin: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true } },
      },
    })
    return reply.send({ puestos })
  })

  // Aprobar puesto (coordinador)
  app.patch('/:id/aprobar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const puesto = await prisma.puestoEmergencia.findUnique({ where: { id } })
    if (!puesto) return reply.status(404).send({ error: 'Puesto no encontrado' })

    const updated = await prisma.puestoEmergencia.update({
      where: { id },
      data: { activo: true, estadoSolicitud: 'APROBADO', motivoRechazo: null },
      select: { id: true, nombre: true, activo: true, estadoSolicitud: true },
    })
    return reply.send({ puesto: updated })
  })

  // Rechazar puesto (coordinador) — guarda el motivo y quita el rol al usuario
  app.patch('/:id/rechazar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { motivo } = (req.body ?? {}) as { motivo?: string }

    const puesto = await prisma.puestoEmergencia.findUnique({
      where: { id },
      select: { adminId: true },
    })
    if (!puesto) return reply.status(404).send({ error: 'Puesto no encontrado' })

    await prisma.$transaction(async (tx) => {
      await tx.puestoEmergencia.update({
        where: { id },
        data: {
          activo: false,
          estadoSolicitud: 'RECHAZADO',
          motivoRechazo: motivo?.trim() || null,
        },
      })

      // Quitar rol PUESTO_EMERGENCIA si no tiene otros puestos aprobados o pendientes
      const otrosPuestos = await tx.puestoEmergencia.count({
        where: {
          adminId: puesto.adminId,
          estadoSolicitud: { in: ['PENDIENTE', 'APROBADO'] },
        },
      })
      if (otrosPuestos === 0) {
        const usuario = await tx.usuario.findUnique({
          where: { id: puesto.adminId },
          select: { roles: true },
        })
        if (usuario) {
          await tx.usuario.update({
            where: { id: puesto.adminId },
            data: { roles: usuario.roles.filter((r) => r !== 'PUESTO_EMERGENCIA') },
          })
        }
      }
    })

    return reply.status(204).send()
  })

  // Solicitud de puesto para usuario ya autenticado
  app.post('/solicitar', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const solicitarSchema = z.object({
      nombre: z.string().min(2, 'El nombre del puesto es obligatorio'),
      tipo: z.string().min(1, 'El tipo de instalación es obligatorio'),
      direccion: z.string().min(5, 'La dirección es obligatoria'),
      descripcion: z.string().max(500).optional(),
      latitud: z.number().min(-90).max(90),
      longitud: z.number().min(-180).max(180),
    })

    const input = solicitarSchema.parse(req.body)
    const userId = (req.user as { id: string }).id

    const catastrofe = await prisma.catastrofe.findFirst({
      orderBy: [{ activa: 'desc' }, { createdAt: 'desc' }],
    })

    if (!catastrofe) {
      return reply.status(422).send({
        error: 'No hay ninguna catástrofe registrada en el sistema. Contacta con un coordinador.',
      })
    }

    const puesto = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.findUnique({
        where: { id: userId },
        select: { roles: true },
      })
      if (!usuario) throw Object.assign(new Error('Usuario no encontrado'), { statusCode: 404 })

      if (!usuario.roles.includes(RolUsuario.PUESTO_EMERGENCIA)) {
        await tx.usuario.update({
          where: { id: userId },
          data: { roles: [...usuario.roles, RolUsuario.PUESTO_EMERGENCIA] },
        })
      }

      // Reutilizar solicitud rechazada si existe
      const rechazado = await tx.puestoEmergencia.findFirst({
        where: { adminId: userId, estadoSolicitud: 'RECHAZADO' },
        orderBy: { createdAt: 'desc' },
      })

      if (rechazado) {
        return tx.puestoEmergencia.update({
          where: { id: rechazado.id },
          data: {
            nombre: input.nombre,
            tipo: input.tipo,
            direccion: input.direccion,
            descripcion: input.descripcion,
            latitud: input.latitud,
            longitud: input.longitud,
            activo: false,
            estadoSolicitud: 'PENDIENTE',
            motivoRechazo: null,
            catastrofeId: catastrofe.id,
          },
          select: { id: true, nombre: true, direccion: true, tipo: true },
        })
      }

      return tx.puestoEmergencia.create({
        data: {
          nombre: input.nombre,
          tipo: input.tipo,
          direccion: input.direccion,
          descripcion: input.descripcion,
          latitud: input.latitud,
          longitud: input.longitud,
          activo: false,
          estadoSolicitud: 'PENDIENTE',
          catastrofeId: catastrofe.id,
          adminId: userId,
        },
        select: { id: true, nombre: true, direccion: true, tipo: true },
      })
    })

    return reply.status(201).send({ puesto })
  })
}

const puestoSelect = {
  id: true,
  nombre: true,
  direccion: true,
  latitud: true,
  longitud: true,
  tipo: true,
  activo: true,
  catastrofe: { select: { id: true, nombre: true, fase: true } },
} as const
