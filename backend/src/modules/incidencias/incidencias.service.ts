import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import type {
  CreateIncidenciaInput,
  CreateComentarioIncidenciaInput,
  ListIncidenciasQuery,
  UpdateEstadoInput,
  UpdateIncidenciaInput,
} from './incidencias.schema.js'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371 * c
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

// La posicion exacta describe el corte y es necesaria para evitarlo al calcular rutas.
// Los identificadores de personas se excluyen de cualquier payload operativo publico.
const incidenciaOperationalSelect = {
  id: true,
  titulo: true,
  categoria: true,
  latitud: true,
  longitud: true,
  estado: true,
  descripcion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IncidenciaViaSelect

const publicComentarioSelect = {
  id: true,
  estado: true,
  comentario: true,
  createdAt: true,
} satisfies Prisma.ComentarioIncidenciaViaSelect

const publicIncidenciaSelect = {
  ...incidenciaOperationalSelect,
  comentarios: {
    orderBy: { createdAt: 'desc' as const },
    select: publicComentarioSelect,
  },
  _count: {
    select: {
      comentarios: true,
      asignacionesVoluntarios: { where: { estado: 'ACTIVA' as const } },
    },
  },
} satisfies Prisma.IncidenciaViaSelect

async function getVoluntarioByUsuario(usuarioId: string) {
  const voluntario = await prisma.voluntario.findUnique({
    where: { usuarioId },
    select: { id: true },
  })

  if (!voluntario) throw badRequest('El usuario no tiene perfil de voluntario')
  return voluntario
}

async function assertNotDuplicateIncidencia(input: CreateIncidenciaInput) {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const recientes = await prisma.incidenciaVia.findMany({
    where: {
      estado: 'CORTADA',
      createdAt: { gte: twoHoursAgo },
    },
    select: {
      id: true,
      titulo: true,
      categoria: true,
      latitud: true,
      longitud: true,
      estado: true,
      descripcion: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const duplicate = recientes.find((incidencia) => {
    const distanceKm = haversineKm(input.latitud, input.longitud, incidencia.latitud, incidencia.longitud)
    return distanceKm <= 0.05
  })

  if (duplicate) {
    const error = new Error('Ya existe una incidencia similar muy cerca en las últimas 2 horas') as Error & {
      statusCode?: number
      duplicateIncidencia?: {
        id: string
        latitud: number
        longitud: number
        estado: 'CORTADA' | 'TRANSITABLE'
        descripcion: string | null
        createdAt: Date
      }
    }
    error.statusCode = 409
    error.duplicateIncidencia = duplicate
    throw error
  }
}

export async function listIncidencias(query: ListIncidenciasQuery) {
  const where: Prisma.IncidenciaViaWhereInput = {
    ...(query.estado ? { estado: query.estado } : {}),
  }

  return prisma.incidenciaVia.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: publicIncidenciaSelect,
  })
}

export async function createIncidencia(input: CreateIncidenciaInput, reportanteId?: string) {
  if (!input.force) {
    await assertNotDuplicateIncidencia(input)
  }

  return prisma.incidenciaVia.create({
    data: {
      reportanteId,
      titulo: input.titulo,
      categoria: input.categoria,
      latitud: input.latitud,
      longitud: input.longitud,
      estado: 'CORTADA',
      descripcion: input.descripcion,
    },
    select: incidenciaOperationalSelect,
  })
}

export async function updateIncidenciaEstado(id: string, input: UpdateEstadoInput) {
  const exists = await prisma.incidenciaVia.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!exists) {
    const error = new Error('Incidencia no encontrada') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  return prisma.$transaction(async (tx) => {
    const incidencia = await tx.incidenciaVia.update({
      where: { id },
      data: { estado: input.estado },
      select: incidenciaOperationalSelect,
    })

    if (input.estado === 'TRANSITABLE') {
      await tx.asignacionIncidencia.updateMany({
        where: { incidenciaId: id, estado: 'ACTIVA' },
        data: { estado: 'FINALIZADA', endedAt: new Date() },
      })
    }

    return incidencia
  })
}

export async function updateIncidenciaByCoordinator(
  id: string,
  input: UpdateIncidenciaInput,
  coordinadorId: string,
) {
  const anterior = await prisma.incidenciaVia.findUnique({
    where: { id },
    select: incidenciaOperationalSelect,
  })
  if (!anterior) throw notFound('Incidencia no encontrada')

  return prisma.$transaction(async (tx) => {
    const incidencia = await tx.incidenciaVia.update({
      where: { id },
      data: input,
      select: incidenciaOperationalSelect,
    })
    if (input.estado === 'TRANSITABLE') {
      await tx.asignacionIncidencia.updateMany({
        where: { incidenciaId: id, estado: 'ACTIVA' },
        data: { estado: 'FINALIZADA', endedAt: new Date() },
      })
    }
    await tx.auditLog.create({
      data: {
        usuarioId: coordinadorId,
        accion: 'EDITAR_INCIDENCIA',
        entidad: 'INCIDENCIA',
        entidadId: id,
        datos: { anterior, cambios: input },
      },
    })
    return incidencia
  })
}

export async function deleteIncidencia(id: string, coordinadorId: string) {
  const incidencia = await prisma.incidenciaVia.findUnique({
    where: { id },
    select: incidenciaOperationalSelect,
  })
  if (!incidencia) throw notFound('Incidencia no encontrada')

  await prisma.$transaction(async (tx) => {
    await tx.asignacionIncidencia.deleteMany({ where: { incidenciaId: id } })
    await tx.comentarioIncidenciaVia.deleteMany({ where: { incidenciaId: id } })
    await tx.incidenciaVia.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        usuarioId: coordinadorId,
        accion: 'ELIMINAR_INCIDENCIA',
        entidad: 'INCIDENCIA',
        entidadId: id,
        datos: incidencia,
      },
    })
  })
}

export async function listVoluntariosIncidenciaByCoordinator(incidenciaId: string) {
  const existe = await prisma.incidenciaVia.findUnique({ where: { id: incidenciaId }, select: { id: true } })
  if (!existe) throw notFound('Incidencia no encontrada')

  return prisma.asignacionIncidencia.findMany({
    where: { incidenciaId, estado: 'ACTIVA' },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      startedAt: true,
      voluntario: {
        select: {
          usuario: {
            select: { nombre: true, apellidos: true, email: true, telefono: true },
          },
        },
      },
    },
  })
}

export async function removeVoluntarioIncidenciaByCoordinator(
  incidenciaId: string,
  asignacionId: string,
  coordinadorId: string,
) {
  const asignacion = await prisma.asignacionIncidencia.findFirst({
    where: { id: asignacionId, incidenciaId, estado: 'ACTIVA' },
    select: { id: true, voluntarioId: true },
  })
  if (!asignacion) throw notFound('Voluntario activo no encontrado en esta incidencia')

  return prisma.$transaction(async (tx) => {
    const retirada = await tx.asignacionIncidencia.update({
      where: { id: asignacionId },
      data: { estado: 'CANCELADA', endedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        usuarioId: coordinadorId,
        accion: 'RETIRAR_VOLUNTARIO_INCIDENCIA',
        entidad: 'INCIDENCIA',
        entidadId: incidenciaId,
        datos: { asignacionId, voluntarioId: asignacion.voluntarioId },
      },
    })
    return retirada
  })
}

export async function getAsignacionIncidenciaActiva(usuarioId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  return prisma.asignacionIncidencia.findFirst({
    where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
    orderBy: { startedAt: 'desc' },
    include: { incidencia: { select: incidenciaOperationalSelect } },
  })
}

export async function listAsignacionesIncidencia(usuarioId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  return prisma.asignacionIncidencia.findMany({
    where: { voluntarioId: voluntario.id },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: { incidencia: { select: incidenciaOperationalSelect } },
  })
}

export async function createAsignacionIncidencia(usuarioId: string, incidenciaId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  return prisma.$transaction(async (tx) => {
    const donacionActiva = await tx.donacion.findFirst({
      where: {
        voluntarioId: voluntario.id,
        estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
      },
      select: { id: true },
    })

    if (donacionActiva) {
      throw badRequest('Ya tienes una donacion activa. Finalizala o cancelala antes de ayudar en una incidencia.')
    }

    const puestoActivo = await tx.asignacionPuesto.findFirst({
      where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
      include: { puesto: true },
    })

    if (puestoActivo) {
      throw badRequest(`Ya estas ayudando en ${puestoActivo.puesto.nombre}. Termina esa tarea antes de elegir una incidencia.`)
    }

    const asignacionActiva = await tx.asignacionIncidencia.findFirst({
      where: { voluntarioId: voluntario.id, estado: 'ACTIVA' },
      include: { incidencia: true },
    })

    if (asignacionActiva) {
      if (asignacionActiva.incidenciaId === incidenciaId) return asignacionActiva
      throw badRequest('Ya estas ayudando en otra incidencia. Terminala antes de elegir otra.')
    }

    const incidencia = await tx.incidenciaVia.findFirst({
      where: { id: incidenciaId, estado: 'CORTADA' },
      select: { id: true },
    })
    if (!incidencia) throw notFound('Incidencia no encontrada o ya transitable')

    return tx.asignacionIncidencia.create({
      data: {
        voluntarioId: voluntario.id,
        incidenciaId,
      },
      include: { incidencia: { select: incidenciaOperationalSelect } },
    })
  })
}

export async function finalizarAsignacionIncidencia(usuarioId: string, incidenciaId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const asignacion = await prisma.asignacionIncidencia.findFirst({
    where: { voluntarioId: voluntario.id, incidenciaId, estado: 'ACTIVA' },
    select: { id: true },
  })

  if (!asignacion) throw notFound('No tienes una asignacion activa en esta incidencia')

  return prisma.asignacionIncidencia.update({
    where: { id: asignacion.id },
    data: {
      estado: 'FINALIZADA',
      endedAt: new Date(),
    },
    include: { incidencia: { select: incidenciaOperationalSelect } },
  })
}

export async function createComentarioIncidencia(
  incidenciaId: string,
  input: CreateComentarioIncidenciaInput,
  autorId?: string,
) {
  const exists = await prisma.incidenciaVia.findUnique({
    where: { id: incidenciaId },
    select: { id: true },
  })

  if (!exists) {
    const error = new Error('Incidencia no encontrada') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }

  return prisma.$transaction(async (tx) => {
    const comentario = await tx.comentarioIncidenciaVia.create({
      data: {
        incidenciaId,
        autorId,
        estado: input.estado,
        comentario: input.comentario,
      },
      select: publicComentarioSelect,
    })

    const incidencia = await tx.incidenciaVia.update({
      where: { id: incidenciaId },
      data: { estado: input.estado },
      select: incidenciaOperationalSelect,
    })

    if (input.estado === 'TRANSITABLE') {
      await tx.asignacionIncidencia.updateMany({
        where: { incidenciaId, estado: 'ACTIVA' },
        data: { estado: 'FINALIZADA', endedAt: new Date() },
      })
    }

    return { comentario, incidencia }
  })
}
