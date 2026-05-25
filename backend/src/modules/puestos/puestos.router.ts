import type { FastifyInstance } from 'fastify'
import { RolUsuario } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { emitRealtime } from '../../lib/realtime.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { listTrabajadores, addTrabajador, removeTrabajador } from './trabajadores.service.js'

type SolicitudPuestoInput = {
  nombre: string
  direccion: string
  tipo: string
  descripcion?: string
  latitud: number
  longitud: number
}

type PuestoUpdateInput = Partial<SolicitudPuestoInput> & {
  activo?: boolean
  capacidadTrabajo?: number
}

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
    select: { id: true, usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true } } },
  })

  if (!voluntario) throw badRequest('El usuario no tiene perfil de voluntario')
  return voluntario
}

async function assertPuestoResponsable(puestoId: string, userId: string) {
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id: puestoId },
    select: {
      id: true,
      adminId: true,
      trabajadores: { where: { usuarioId: userId }, select: { id: true } },
    },
  })

  if (!puesto) throw notFound('Puesto no encontrado')
  if (puesto.adminId !== userId && puesto.trabajadores.length === 0) {
    throw Object.assign(new Error('Solo el responsable del puesto puede gestionar voluntarios'), { statusCode: 403 })
  }

  return puesto
}

function formatParticipante(asignacion: {
  id: string
  startedAt: Date
  voluntario: {
    id: string
    usuario: { id: string; nombre: string; apellidos: string; email: string; dni: string | null; telefono: string | null }
  }
}) {
  return {
    id: asignacion.id,
    voluntarioId: asignacion.voluntario.id,
    usuario: asignacion.voluntario.usuario,
    startedAt: asignacion.startedAt,
  }
}

const puestoPublicSelect = {
  id: true,
  nombre: true,
  direccion: true,
  latitud: true,
  longitud: true,
  tipo: true,
  activo: true,
} as const

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
  }
}

function formatPuestoCoordinador(puesto: {
  id: string
  nombre: string
  descripcion: string | null
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
  estadoSolicitud: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
  motivoRechazo: string | null
  capacidadTrabajo: number
  createdAt: Date
  updatedAt: Date
  admin: { id: string; nombre: string; apellidos: string; email: string; telefono: string | null }
  _count: {
    asignacionesVoluntarios: number
    trabajadores: number
    solicitudesParticipacion: number
    inventario: number
  }
}) {
  const responsables = puesto._count.trabajadores + 1
  const voluntariosActivos = puesto._count.asignacionesVoluntarios
  const solicitudesPendientes = puesto._count.solicitudesParticipacion
  const necesidades = puesto._count.inventario
  const estadoOperativo = !puesto.activo
    ? 'CERRADO'
    : voluntariosActivos >= puesto.capacidadTrabajo
      ? 'SATURADO'
      : necesidades > 0 && voluntariosActivos === 0
        ? 'SIN_RECURSOS'
        : solicitudesPendientes > 0 || voluntariosActivos < Math.ceil(puesto.capacidadTrabajo * 0.5)
          ? 'NECESITA_VOLUNTARIOS'
          : 'OPERATIVO'

  return {
    id: puesto.id,
    nombre: puesto.nombre,
    descripcion: puesto.descripcion,
    direccion: puesto.direccion,
    latitud: puesto.latitud,
    longitud: puesto.longitud,
    tipo: puesto.tipo,
    activo: puesto.activo,
    estadoSolicitud: puesto.estadoSolicitud,
    motivoRechazo: puesto.motivoRechazo,
    capacidadTrabajo: puesto.capacidadTrabajo,
    voluntariosActivos,
    responsables,
    personasTotales: responsables + voluntariosActivos,
    solicitudesPendientes,
    necesidades,
    estadoOperativo,
    createdAt: puesto.createdAt,
    updatedAt: puesto.updatedAt,
    admin: puesto.admin,
  }
}

function validateSolicitudPuesto(body: Partial<SolicitudPuestoInput>) {
  if (!body.nombre?.trim()) throw badRequest('El nombre del puesto es obligatorio')
  if (!body.direccion?.trim()) throw badRequest('La direccion del puesto es obligatoria')
  if (!body.tipo?.trim()) throw badRequest('El tipo de instalacion es obligatorio')
  if (body.nombre.trim().length > 100) throw badRequest('El nombre del puesto no puede superar 100 caracteres')
  if (body.direccion.trim().length > 180) throw badRequest('La direccion del puesto no puede superar 180 caracteres')
  if (body.tipo.trim().length > 60) throw badRequest('El tipo de instalacion no puede superar 60 caracteres')
  if (body.descripcion && body.descripcion.trim().length > 500) {
    throw badRequest('La descripcion no puede superar 500 caracteres')
  }
  if (typeof body.latitud !== 'number' || body.latitud < -90 || body.latitud > 90) {
    throw badRequest('La latitud no es valida')
  }
  if (typeof body.longitud !== 'number' || body.longitud < -180 || body.longitud > 180) {
    throw badRequest('La longitud no es valida')
  }

  return {
    nombre: body.nombre.trim(),
    direccion: body.direccion.trim(),
    tipo: body.tipo.trim(),
    descripcion: body.descripcion?.trim() || undefined,
    latitud: body.latitud,
    longitud: body.longitud,
  }
}

function validateMotivoRechazo(motivo: unknown) {
  if (typeof motivo !== 'string' || motivo.trim().length < 10) {
    throw badRequest('El motivo del rechazo debe tener al menos 10 caracteres')
  }
  if (motivo.trim().length > 500) {
    throw badRequest('El motivo del rechazo no puede superar 500 caracteres')
  }
  return motivo.trim()
}

function validatePuestoUpdate(body: PuestoUpdateInput) {
  const data: {
    nombre?: string
    direccion?: string
    tipo?: string
    descripcion?: string | null
    latitud?: number
    longitud?: number
    activo?: boolean
    capacidadTrabajo?: number
  } = {}

  if (body.nombre !== undefined) {
    if (!body.nombre.trim()) throw badRequest('El nombre del puesto es obligatorio')
    data.nombre = body.nombre.trim()
  }
  if (body.direccion !== undefined) {
    if (!body.direccion.trim()) throw badRequest('La direccion del puesto es obligatoria')
    data.direccion = body.direccion.trim()
  }
  if (body.tipo !== undefined) {
    if (!body.tipo.trim()) throw badRequest('El tipo de instalacion es obligatorio')
    data.tipo = body.tipo.trim()
  }
  if (body.descripcion !== undefined) {
    data.descripcion = body.descripcion?.trim() || null
  }
  if (body.latitud !== undefined) {
    if (typeof body.latitud !== 'number' || body.latitud < -90 || body.latitud > 90) {
      throw badRequest('La latitud no es valida')
    }
    data.latitud = body.latitud
  }
  if (body.longitud !== undefined) {
    if (typeof body.longitud !== 'number' || body.longitud < -180 || body.longitud > 180) {
      throw badRequest('La longitud no es valida')
    }
    data.longitud = body.longitud
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') throw badRequest('El estado activo debe ser verdadero o falso')
    data.activo = body.activo
  }
  if (body.capacidadTrabajo !== undefined) {
    if (!Number.isInteger(body.capacidadTrabajo) || body.capacidadTrabajo < 1 || body.capacidadTrabajo > 500) {
      throw badRequest('La capacidad debe ser un numero entero entre 1 y 500')
    }
    data.capacidadTrabajo = body.capacidadTrabajo
  }

  if (Object.keys(data).length === 0) throw badRequest('No hay cambios para guardar')
  return data
}

async function findPuestoCoordinador(id: string) {
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id },
    include: {
      admin: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
      _count: {
        select: {
          inventario: { where: { tipo: 'NECESARIO' } },
          asignacionesVoluntarios: { where: { estado: 'ACTIVA' } },
          trabajadores: true,
          solicitudesParticipacion: { where: { estado: 'PENDIENTE' } },
        },
      },
    },
  })

  if (!puesto) throw notFound('Puesto no encontrado')
  return formatPuestoCoordinador(puesto)
}

export async function puestosRouter(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    const puestos = await prisma.puestoEmergencia.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        direccion: true,
        latitud: true,
        longitud: true,
        tipo: true,
        activo: true,
        capacidadTrabajo: true,
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
      include: { puesto: { select: puestoPublicSelect } },
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
      include: { puesto: { select: puestoPublicSelect } },
    })

    reply.send({ asignaciones })
  })

  app.get('/mis-solicitudes-participacion', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const solicitudes = await prisma.solicitudParticipacionPuesto.findMany({
      where: { usuarioId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        puesto: {
          select: {
            id: true,
            nombre: true,
            direccion: true,
            latitud: true,
            longitud: true,
            tipo: true,
            activo: true,
                    },
        },
      },
    })

    reply.send({ solicitudes })
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
      ...comoAdmin.map((puesto) => ({ ...puesto, esAdmin: true })),
      ...comoTrabajador
        .filter((p) => !adminIds.has(p.id))
        .map((puesto) => ({ ...puesto, esAdmin: false })),
    ]

    return reply.send({ puestos })
  })

  app.post('/solicitudes', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const input = validateSolicitudPuesto(req.body as Partial<SolicitudPuestoInput>)

    const solicitud = await prisma.$transaction(async (tx) => {
      const puestoExistente = await tx.puestoEmergencia.findFirst({
        where: {
          OR: [
            { adminId: userId },
            { trabajadores: { some: { usuarioId: userId } } },
          ],
        },
        select: { id: true },
      })
      if (puestoExistente) throw badRequest('Ya tienes un puesto asociado')

      const pendiente = await tx.solicitudPuesto.findFirst({
        where: { usuarioId: userId, estado: 'PENDIENTE' },
        select: { id: true },
      })
      if (pendiente) throw badRequest('Ya tienes una solicitud pendiente')

      const creada = await tx.solicitudPuesto.create({
        data: { ...input, usuarioId: userId },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: userId,
          accion: 'SOLICITAR_CREACION_PUESTO',
          entidad: 'SOLICITUD_PUESTO',
          entidadId: creada.id,
          datos: { estadoNuevo: 'PENDIENTE', nombre: input.nombre },
        },
      })

      return creada
    })

    emitRealtime('solicitud-puesto:updated', { solicitud })
    return reply.status(201).send({ solicitud })
  })

  app.get('/solicitudes/mia', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const solicitud = await prisma.solicitudPuesto.findFirst({
      where: { usuarioId: userId },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ solicitud })
  })

  app.get('/solicitudes', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (_req, reply) => {
    const solicitudes = await prisma.solicitudPuesto.findMany({
      orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true, dni: true } },
        coordinador: { select: { id: true, nombre: true, apellidos: true } },
      },
    })

    return reply.send({ solicitudes })
  })

  app.get('/coordinador', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (_req, reply) => {
    const puestos = await prisma.puestoEmergencia.findMany({
      orderBy: [{ activo: 'desc' }, { updatedAt: 'desc' }],
      include: {
          admin: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
        _count: {
          select: {
            inventario: { where: { tipo: 'NECESARIO' } },
            asignacionesVoluntarios: { where: { estado: 'ACTIVA' } },
            trabajadores: true,
            solicitudesParticipacion: { where: { estado: 'PENDIENTE' } },
          },
        },
      },
    })

    return reply.send({ puestos: puestos.map(formatPuestoCoordinador) })
  })

  app.patch('/coordinador/:id', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const coordinadorId = (req.user as { id: string }).id
    const data = validatePuestoUpdate(req.body as PuestoUpdateInput)

    const existe = await prisma.puestoEmergencia.findUnique({ where: { id }, select: { id: true } })
    if (!existe) throw notFound('Puesto no encontrado')

    await prisma.$transaction(async (tx) => {
      await tx.puestoEmergencia.update({ where: { id }, data })

      if (data.activo === false) {
        await tx.asignacionPuesto.updateMany({
          where: { puestoId: id, estado: 'ACTIVA' },
          data: { estado: 'CANCELADA', endedAt: new Date() },
        })
      }

      await tx.auditLog.create({
        data: {
          usuarioId: coordinadorId,
          accion: data.activo === false ? 'DESACTIVAR_PUESTO' : 'EDITAR_PUESTO',
          entidad: 'PUESTO',
          entidadId: id,
          datos: data,
        },
      })
    })

    const puesto = await findPuestoCoordinador(id)
    emitRealtime('puesto:updated', { puesto })
    return reply.send({ puesto })
  })

  app.delete('/coordinador/:id', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const coordinadorId = (req.user as { id: string }).id
    const existe = await prisma.puestoEmergencia.findUnique({ where: { id }, select: { id: true } })
    if (!existe) throw notFound('Puesto no encontrado')

    await prisma.$transaction(async (tx) => {
      await tx.asignacionPuesto.updateMany({
        where: { puestoId: id, estado: 'ACTIVA' },
        data: { estado: 'CANCELADA', endedAt: new Date() },
      })
      await tx.solicitudParticipacionPuesto.updateMany({
        where: { puestoId: id, estado: 'PENDIENTE' },
        data: {
          estado: 'RECHAZADA',
          motivoRechazo: 'Puesto eliminado por coordinacion',
          decidedAt: new Date(),
        },
      })
      await tx.puestoEmergencia.update({
        where: { id },
        data: {
          activo: false,
          motivoRechazo: 'Puesto eliminado por coordinacion',
        },
      })
      await tx.auditLog.create({
        data: {
          usuarioId: coordinadorId,
          accion: 'ELIMINAR_PUESTO',
          entidad: 'PUESTO',
          entidadId: id,
          datos: { activo: false },
        },
      })
    })

    const puesto = await findPuestoCoordinador(id)
    emitRealtime('puesto:updated', { puesto })
    emitRealtime('solicitud-participacion:updated', { puestoId: id })
    return reply.send({ puesto })
  })

  app.get('/coordinador/:id/detalle', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const puesto = await prisma.puestoEmergencia.findUnique({
      where: { id },
      include: {
          admin: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
        inventario: {
          orderBy: [{ tipo: 'asc' }, { producto: { nombre: 'asc' } }],
          include: { producto: true },
        },
        asignacionesVoluntarios: {
          where: { estado: 'ACTIVA' },
          orderBy: { startedAt: 'asc' },
          include: {
            voluntario: {
              include: {
                usuario: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true, telefono: true } },
              },
            },
          },
        },
        solicitudesParticipacion: {
          orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
          include: {
            usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
            responsable: { select: { id: true, nombre: true, apellidos: true } },
          },
        },
        donaciones: {
          where: { estado: { in: ['PENDIENTE', 'EN_CAMINO'] } },
          orderBy: { createdAt: 'desc' },
          include: {
            producto: true,
            voluntario: {
              include: {
                usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
              },
            },
          },
        },
        _count: {
          select: {
            inventario: { where: { tipo: 'NECESARIO' } },
            asignacionesVoluntarios: { where: { estado: 'ACTIVA' } },
            trabajadores: true,
            solicitudesParticipacion: { where: { estado: 'PENDIENTE' } },
          },
        },
      },
    })

    if (!puesto) throw notFound('Puesto no encontrado')

    const actividad = await prisma.auditLog.findMany({
      where: { entidad: 'PUESTO', entidadId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { usuario: { select: { nombre: true, apellidos: true, email: true } } },
    })

    return reply.send({
      puesto: formatPuestoCoordinador(puesto),
      inventario: puesto.inventario,
      participantes: puesto.asignacionesVoluntarios.map(formatParticipante),
      solicitudesParticipacion: puesto.solicitudesParticipacion,
      donaciones: puesto.donaciones,
      actividad,
    })
  })

  app.post('/coordinador/participaciones/:solicitudId/aceptar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (request, reply) => {
    const { solicitudId } = request.params as { solicitudId: string }
    const responsableId = (request.user as { id: string }).id

    const result = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudParticipacionPuesto.findUnique({
        where: { id: solicitudId },
        include: { puesto: { select: { id: true, capacidadTrabajo: true, activo: true } } },
      })
      if (!solicitud) throw notFound('Solicitud de participacion no encontrada')
      if (solicitud.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')
      if (!solicitud.puesto.activo) throw badRequest('El puesto no esta activo')

      const voluntario = await tx.voluntario.findUnique({ where: { usuarioId: solicitud.usuarioId }, select: { id: true } })
      if (!voluntario) throw badRequest('El usuario ya no tiene perfil de voluntario')

      const activa = await tx.asignacionPuesto.findFirst({
        where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
        include: { puesto: { select: puestoPublicSelect } },
      })

      const trabajando = await tx.asignacionPuesto.count({
        where: { puestoId: solicitud.puestoId, estado: 'ACTIVA' },
      })
      const yaEstaEnEstePuesto = activa?.puestoId === solicitud.puestoId
      if (!yaEstaEnEstePuesto && trabajando >= solicitud.puesto.capacidadTrabajo) {
        throw badRequest('Este puesto esta lleno ahora mismo.')
      }

      if (activa && !yaEstaEnEstePuesto) {
        await tx.asignacionPuesto.update({
          where: { id: activa.id },
          data: { estado: 'FINALIZADA', endedAt: new Date() },
        })
      }

      const asignacion = yaEstaEnEstePuesto
        ? await tx.asignacionPuesto.findUniqueOrThrow({
            where: { id: activa.id },
            include: {
              puesto: { select: puestoPublicSelect },
              voluntario: {
                include: {
                  usuario: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true, telefono: true } },
                },
              },
            },
          })
        : await tx.asignacionPuesto.create({
            data: { voluntarioId: voluntario.id, puestoId: solicitud.puestoId },
            include: {
              puesto: { select: puestoPublicSelect },
              voluntario: {
                include: {
                  usuario: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true, telefono: true } },
                },
              },
            },
          })

      const revisada = await tx.solicitudParticipacionPuesto.update({
        where: { id: solicitudId },
        data: { estado: 'ACEPTADA', responsableId, decidedAt: new Date() },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
          responsable: { select: { id: true, nombre: true, apellidos: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: responsableId,
          accion: 'ACEPTAR_PARTICIPACION_PUESTO',
          entidad: 'PUESTO',
          entidadId: solicitud.puestoId,
          datos: { solicitudId, puestoAnteriorId: yaEstaEnEstePuesto ? null : activa?.puestoId ?? null },
        },
      })

      return { solicitud: revisada, asignacion }
    })

    emitRealtime('solicitud-participacion:updated', { solicitud: result.solicitud, asignacion: result.asignacion, puestoId: result.solicitud.puestoId })
    emitRealtime('puesto:updated', { puestoId: result.solicitud.puestoId })
    reply.send(result)
  })

  app.post('/coordinador/participaciones/:solicitudId/rechazar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (request, reply) => {
    const { solicitudId } = request.params as { solicitudId: string }
    const { motivo } = (request.body ?? {}) as { motivo?: unknown }
    const responsableId = (request.user as { id: string }).id

    const actual = await prisma.solicitudParticipacionPuesto.findUnique({
      where: { id: solicitudId },
      select: { estado: true },
    })
    if (!actual) throw notFound('Solicitud de participacion no encontrada')
    if (actual.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')
    const motivoRechazo = validateMotivoRechazo(motivo)

    const solicitud = await prisma.$transaction(async (tx) => {
      const revisada = await tx.solicitudParticipacionPuesto.update({
        where: { id: solicitudId },
        data: {
          estado: 'RECHAZADA',
          motivoRechazo,
          responsableId,
          decidedAt: new Date(),
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
          responsable: { select: { id: true, nombre: true, apellidos: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: responsableId,
          accion: 'RECHAZAR_PARTICIPACION_PUESTO',
          entidad: 'PUESTO',
          entidadId: revisada.puestoId,
          datos: { solicitudId, motivo: motivoRechazo },
        },
      })

      return revisada
    })

    emitRealtime('solicitud-participacion:updated', { solicitud, puestoId: solicitud.puestoId })
    reply.send({ solicitud })
  })

  app.post('/solicitudes/:id/aceptar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const coordinadorId = (req.user as { id: string }).id

    const result = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPuesto.findUnique({ where: { id } })
      if (!solicitud) throw notFound('Solicitud no encontrada')
      if (solicitud.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')

      const puestoExistente = await tx.puestoEmergencia.findFirst({
        where: {
          OR: [
            { adminId: solicitud.usuarioId },
            { trabajadores: { some: { usuarioId: solicitud.usuarioId } } },
          ],
        },
        select: { id: true },
      })
      if (puestoExistente) throw badRequest('El solicitante ya tiene un puesto asociado')

      const usuario = await tx.usuario.findUnique({
        where: { id: solicitud.usuarioId },
        select: { roles: true },
      })
      if (!usuario) throw notFound('Usuario no encontrado')

      if (!usuario.roles.includes(RolUsuario.PUESTO_EMERGENCIA)) {
        await tx.usuario.update({
          where: { id: solicitud.usuarioId },
          data: { roles: [...usuario.roles, RolUsuario.PUESTO_EMERGENCIA] },
        })
      }

      const puesto = await tx.puestoEmergencia.create({
        data: {
          nombre: solicitud.nombre,
          descripcion: solicitud.descripcion,
          direccion: solicitud.direccion,
          latitud: solicitud.latitud,
          longitud: solicitud.longitud,
          tipo: solicitud.tipo,
          activo: true,
          estadoSolicitud: 'APROBADO',
          adminId: solicitud.usuarioId,
        },
        select: puestoSelect,
      })

      const revisada = await tx.solicitudPuesto.update({
        where: { id },
        data: {
          estado: 'ACEPTADA',
          coordinadorId,
          decidedAt: new Date(),
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
          coordinador: { select: { id: true, nombre: true, apellidos: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: coordinadorId,
          accion: 'ACEPTAR_SOLICITUD_PUESTO',
          entidad: 'SOLICITUD_PUESTO',
          entidadId: id,
          datos: {
            estadoAnterior: 'PENDIENTE',
            estadoNuevo: 'ACEPTADA',
            puestoId: puesto.id,
            solicitanteId: solicitud.usuarioId,
          },
        },
      })

      return { solicitud: revisada, puesto }
    })

    emitRealtime('solicitud-puesto:updated', { solicitud: result.solicitud, puesto: result.puesto })
    emitRealtime('puesto:updated', { puesto: result.puesto })
    return reply.send(result)
  })

  app.post('/solicitudes/:id/rechazar', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { motivo } = (req.body ?? {}) as { motivo?: unknown }
    const coordinadorId = (req.user as { id: string }).id

    const actual = await prisma.solicitudPuesto.findUnique({ where: { id }, select: { estado: true } })
    if (!actual) throw notFound('Solicitud no encontrada')
    if (actual.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')
    const motivoRechazo = validateMotivoRechazo(motivo)

    const solicitud = await prisma.$transaction(async (tx) => {
      const revisada = await tx.solicitudPuesto.update({
        where: { id },
        data: {
          estado: 'RECHAZADA',
          motivoRechazo,
          coordinadorId,
          decidedAt: new Date(),
        },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
          coordinador: { select: { id: true, nombre: true, apellidos: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: coordinadorId,
          accion: 'RECHAZAR_SOLICITUD_PUESTO',
          entidad: 'SOLICITUD_PUESTO',
          entidadId: id,
          datos: { estadoAnterior: 'PENDIENTE', estadoNuevo: 'RECHAZADA', motivo: motivoRechazo },
        },
      })

      return revisada
    })

    emitRealtime('solicitud-puesto:updated', { solicitud })
    return reply.send({ solicitud })
  })

  app.post('/:id/participaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (request, reply) => {
    const usuarioId = getUsuarioId(request.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const { id: puestoId } = request.params as { id: string }
    const voluntario = await getVoluntarioByUsuario(usuarioId)

    const solicitud = await prisma.$transaction(async (tx) => {
      const puesto = await tx.puestoEmergencia.findFirst({
        where: { id: puestoId, activo: true },
        select: { id: true, capacidadTrabajo: true, nombre: true },
      })
      if (!puesto) throw notFound('Puesto no encontrado')

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
        include: { puesto: { select: puestoPublicSelect } },
      })
      if (asignacionActiva) {
        if (asignacionActiva.puestoId === puestoId) throw badRequest('Ya formas parte activa de este puesto.')
        throw badRequest(`Ya estas ayudando en ${asignacionActiva.puesto.nombre}. Abandona ese puesto antes de solicitar otro.`)
      }

      const trabajando = await tx.asignacionPuesto.count({ where: { puestoId, estado: 'ACTIVA' } })
      if (trabajando >= puesto.capacidadTrabajo) throw badRequest('Este puesto esta lleno ahora mismo.')

      const pendiente = await tx.solicitudParticipacionPuesto.findFirst({
        where: { puestoId, usuarioId, estado: 'PENDIENTE' },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
          puesto: { select: { id: true, nombre: true, direccion: true } },
        },
      })
      if (pendiente) return pendiente

      const creada = await tx.solicitudParticipacionPuesto.create({
        data: { puestoId, usuarioId },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
          puesto: { select: { id: true, nombre: true, direccion: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId,
          accion: 'SOLICITAR_PARTICIPACION_PUESTO',
          entidad: 'PUESTO',
          entidadId: puestoId,
          datos: { solicitudId: creada.id, estadoNuevo: 'PENDIENTE' },
        },
      })

      return creada
    })

    emitRealtime('solicitud-participacion:updated', { solicitud, puestoId })
    reply.status(201).send({ solicitud })
  })

  app.get('/:id/solicitudes-participacion', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { id: puestoId } = request.params as { id: string }
    const userId = (request.user as { id: string }).id
    await assertPuestoResponsable(puestoId, userId)

    const solicitudes = await prisma.solicitudParticipacionPuesto.findMany({
      where: { puestoId },
      orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
        responsable: { select: { id: true, nombre: true, apellidos: true } },
      },
    })

    reply.send({ solicitudes })
  })

  app.post('/participaciones/:solicitudId/aceptar', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { solicitudId } = request.params as { solicitudId: string }
    const responsableId = (request.user as { id: string }).id

    const result = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudParticipacionPuesto.findUnique({
        where: { id: solicitudId },
        include: { puesto: { select: { id: true, capacidadTrabajo: true, adminId: true } } },
      })
      if (!solicitud) throw notFound('Solicitud de participacion no encontrada')
      if (solicitud.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')

      const puestoAcceso = await tx.puestoEmergencia.findUnique({
        where: { id: solicitud.puestoId },
        select: {
          adminId: true,
          trabajadores: { where: { usuarioId: responsableId }, select: { id: true } },
        },
      })
      if (!puestoAcceso) throw notFound('Puesto no encontrado')
      if (puestoAcceso.adminId !== responsableId && puestoAcceso.trabajadores.length === 0) {
        throw Object.assign(new Error('Solo el responsable del puesto puede aceptar solicitudes'), { statusCode: 403 })
      }

      const voluntario = await tx.voluntario.findUnique({
        where: { usuarioId: solicitud.usuarioId },
        select: { id: true },
      })
      if (!voluntario) throw badRequest('El usuario ya no tiene perfil de voluntario')

      const activa = await tx.asignacionPuesto.findFirst({
        where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
        include: { puesto: { select: puestoPublicSelect } },
      })
      if (activa) {
        throw badRequest(`El voluntario ya esta participando en ${activa.puesto.nombre}`)
      }

      const trabajando = await tx.asignacionPuesto.count({
        where: { puestoId: solicitud.puestoId, estado: 'ACTIVA' },
      })
      if (trabajando >= solicitud.puesto.capacidadTrabajo) {
        throw badRequest('Este puesto esta lleno ahora mismo.')
      }

      const asignacion = await tx.asignacionPuesto.create({
        data: { voluntarioId: voluntario.id, puestoId: solicitud.puestoId },
        include: {
          puesto: { select: puestoPublicSelect },
          voluntario: {
            include: {
              usuario: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true, telefono: true } },
            },
          },
        },
      })

      const revisada = await tx.solicitudParticipacionPuesto.update({
        where: { id: solicitudId },
        data: { estado: 'ACEPTADA', responsableId, decidedAt: new Date() },
        include: {
          usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
          responsable: { select: { id: true, nombre: true, apellidos: true } },
        },
      })

      return { solicitud: revisada, asignacion }
    })

    emitRealtime('solicitud-participacion:updated', { solicitud: result.solicitud, asignacion: result.asignacion, puestoId: result.solicitud.puestoId })
    emitRealtime('puesto:updated', { puestoId: result.solicitud.puestoId })
    reply.send(result)
  })

  app.post('/participaciones/:solicitudId/rechazar', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { solicitudId } = request.params as { solicitudId: string }
    const { motivo } = request.body as { motivo?: string }
    const responsableId = (request.user as { id: string }).id

    const actual = await prisma.solicitudParticipacionPuesto.findUnique({
      where: { id: solicitudId },
      select: { estado: true, puestoId: true },
    })
    if (!actual) throw notFound('Solicitud de participacion no encontrada')
    if (actual.estado !== 'PENDIENTE') throw badRequest('La solicitud ya esta revisada')

    await assertPuestoResponsable(actual.puestoId, responsableId)

    const solicitud = await prisma.solicitudParticipacionPuesto.update({
      where: { id: solicitudId },
      data: {
        estado: 'RECHAZADA',
        motivoRechazo: motivo?.trim() || undefined,
        responsableId,
        decidedAt: new Date(),
      },
      include: {
        usuario: { select: { id: true, nombre: true, apellidos: true, dni: true, email: true, telefono: true } },
        responsable: { select: { id: true, nombre: true, apellidos: true } },
      },
    })

    emitRealtime('solicitud-participacion:updated', { solicitud, puestoId: solicitud.puestoId })
    reply.send({ solicitud })
  })

  app.get('/:id/participantes', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { id: puestoId } = request.params as { id: string }
    const responsableId = (request.user as { id: string }).id
    await assertPuestoResponsable(puestoId, responsableId)

    const participantes = await prisma.asignacionPuesto.findMany({
      where: { puestoId, estado: 'ACTIVA' },
      orderBy: { startedAt: 'asc' },
      include: {
        voluntario: {
          include: {
            usuario: { select: { id: true, nombre: true, apellidos: true, email: true, dni: true, telefono: true } },
          },
        },
      },
    })

    reply.send({ participantes: participantes.map(formatParticipante) })
  })

  app.get('/:id/donaciones', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { id: puestoId } = request.params as { id: string }
    const responsableId = (request.user as { id: string }).id
    await assertPuestoResponsable(puestoId, responsableId)

    const donaciones = await prisma.donacion.findMany({
      where: { puestoId, estado: { in: ['PENDIENTE', 'EN_CAMINO'] } },
      orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }],
      include: {
        producto: true,
        voluntario: {
          include: {
            usuario: { select: { id: true, nombre: true, apellidos: true, email: true, telefono: true } },
          },
        },
      },
    })

    reply.send({ donaciones })
  })

  app.delete('/:id/participantes/:asignacionId', {
    preHandler: [requireAuth, requireRole('PUESTO_EMERGENCIA')],
  }, async (request, reply) => {
    const { id: puestoId, asignacionId } = request.params as { id: string; asignacionId: string }
    const responsableId = (request.user as { id: string }).id
    await assertPuestoResponsable(puestoId, responsableId)

    const asignacion = await prisma.asignacionPuesto.findFirst({
      where: { id: asignacionId, puestoId, estado: 'ACTIVA' },
      select: { id: true },
    })
    if (!asignacion) throw notFound('Voluntario activo no encontrado en este puesto')

    await prisma.asignacionPuesto.update({
      where: { id: asignacion.id },
      data: { estado: 'CANCELADA', endedAt: new Date() },
    })

    emitRealtime('puesto:updated', { puestoId })
    reply.status(204).send()
  })

  app.post('/:id/asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, async (_request, _reply) => {
    throw Object.assign(
      new Error('La incorporacion directa a puestos ya no esta disponible. Envia una solicitud de participacion.'),
      { statusCode: 410 },
    )
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
      include: { puesto: { select: puestoPublicSelect } },
    })

    emitRealtime('puesto:updated', { puestoId, asignacion: finalizada })
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

}

const puestoSelect = {
  id: true,
  nombre: true,
  direccion: true,
  latitud: true,
  longitud: true,
  tipo: true,
  activo: true,
} as const
