import type { EstadoDonacion } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { appendChainEvent } from '../../lib/chain.js'
import { runSerializableTransaction } from '../../lib/serializable-transaction.js'
import type { CreateDonacionInput } from './donaciones.schema.js'

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 })
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

const puestoDonacionSelect = {
  id: true,
  nombre: true,
  direccion: true,
  latitud: true,
  longitud: true,
  tipo: true,
  activo: true,
} as const

const DONACION_TRANSITIONS: Record<EstadoDonacion, EstadoDonacion[]> = {
  PENDIENTE: ['EN_CAMINO', 'CANCELADA'],
  EN_CAMINO: ['CANCELADA'],
  ENTREGADA: [],
  CANCELADA: [],
}

function assertEstadoTransition(actual: EstadoDonacion, siguiente: EstadoDonacion) {
  if (actual === siguiente) return
  if (!DONACION_TRANSITIONS[actual].includes(siguiente)) {
    if (siguiente === 'ENTREGADA') {
      throw badRequest('La entrega debe confirmarse escaneando el QR en el puesto.')
    }
    throw badRequest(`No se puede cambiar una donacion de ${actual} a ${siguiente}.`)
  }
}

async function getVoluntarioByUsuario(usuarioId: string) {
  const voluntario = await prisma.voluntario.findUnique({
    where: { usuarioId },
    select: { id: true },
  })

  if (voluntario) return voluntario

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { roles: true },
  })

  if (!usuario?.roles.includes('VOLUNTARIO')) {
    throw badRequest('El usuario no tiene perfil de voluntario')
  }

  return prisma.voluntario.create({
    data: { usuarioId },
    select: { id: true },
  })
}

export async function listNecesidadesDonacion() {
  const necesidades = await prisma.inventario.findMany({
    where: {
      tipo: 'NECESARIO',
      puesto: { activo: true },
      cantidad: { gt: 0 },
    },
    orderBy: [
      { puesto: { nombre: 'asc' } },
      { producto: { nombre: 'asc' } },
    ],
    include: {
      producto: true,
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

  const comprometidas = await prisma.donacion.groupBy({
    by: ['puestoId', 'productoId'],
    where: {
      estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
    },
    _sum: { cantidad: true },
  })

  const comprometidasMap = new Map(
    comprometidas.map((item) => [`${item.puestoId}:${item.productoId}`, item._sum.cantidad ?? 0]),
  )

  return necesidades.map((item) => {
    const cantidadComprometida = comprometidasMap.get(`${item.puestoId}:${item.productoId}`) ?? 0
    const cantidadPendiente = Math.max(item.cantidad - cantidadComprometida, 0)

    return {
      id: item.id,
      puesto: item.puesto,
      producto: item.producto,
      cantidadNecesaria: item.cantidad,
      cantidadComprometida,
      cantidadPendiente,
      unidad: item.producto.unidad,
      prioridad: cantidadPendiente <= 0 ? 'cubierta' : cantidadPendiente <= item.cantidad * 0.3 ? 'baja' : 'alta',
      updatedAt: item.updatedAt,
    }
  }).filter((item) => item.cantidadPendiente > 0)
}

export async function createDonacion(usuarioId: string, input: CreateDonacionInput) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await runSerializableTransaction(async (tx) => {
    const necesidad = await tx.inventario.findFirst({
      where: {
        puestoId: input.puestoId,
        productoId: input.productoId,
        tipo: 'NECESARIO',
        puesto: { activo: true },
      },
      include: { producto: true, puesto: { select: puestoDonacionSelect } },
    })

    if (!necesidad) throw notFound('Necesidad no encontrada para este puesto')

    const comprometida = await tx.donacion.aggregate({
      where: {
        puestoId: input.puestoId,
        productoId: input.productoId,
        estado: { in: ['PENDIENTE', 'EN_CAMINO'] },
      },
      _sum: { cantidad: true },
    })
    const cantidadComprometida = comprometida._sum.cantidad ?? 0
    const cantidadPendiente = Math.max(necesidad.cantidad - cantidadComprometida, 0)

    if (cantidadPendiente <= 0) {
      throw badRequest('Esta necesidad ya esta cubierta por otras donaciones en camino')
    }

    if (input.cantidad > cantidadPendiente) {
      throw badRequest(`La cantidad supera lo pendiente. Quedan ${cantidadPendiente} ${necesidad.producto.unidad}`)
    }

    return tx.donacion.create({
      data: {
        voluntarioId: voluntario.id,
        puestoId: input.puestoId,
        productoId: input.productoId,
        cantidad: input.cantidad,
        unidad: input.unidad,
        comentario: input.comentario,
        eta: input.eta ? new Date(input.eta) : undefined,
      },
      include: {
        producto: true,
        puesto: { select: puestoDonacionSelect },
      },
    })
  })

  void appendChainEvent({
    tipo: 'DONACION_CREADA',
    actorId: usuarioId,
    actorRol: 'VOLUNTARIO',
    entidad: 'donacion',
    entidadId: donacion.id,
    payload: {
      donacionId: donacion.id,
      producto: { id: donacion.producto.id, nombre: donacion.producto.nombre, categoria: donacion.producto.categoria },
      cantidad: donacion.cantidad,
      unidad: donacion.unidad,
      puestoId: donacion.puestoId,
      puestoNombre: donacion.puesto.nombre,
    },
  })

  return donacion
}

export async function listMisDonaciones(usuarioId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  return prisma.donacion.findMany({
    where: { voluntarioId: voluntario.id },
    orderBy: { createdAt: 'desc' },
    include: {
      producto: true,
      puesto: { select: puestoDonacionSelect },
    },
  })
}

export async function updateDonacionEstado(usuarioId: string, donacionId: string, estado: EstadoDonacion) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await prisma.donacion.findFirst({
    where: { id: donacionId, voluntarioId: voluntario.id },
    select: { id: true, estado: true, puestoId: true },
  })

  if (!donacion) throw notFound('Donacion no encontrada')
  assertEstadoTransition(donacion.estado, estado)

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.donacion.update({
      where: { id: donacionId },
      data: { estado },
      include: {
        producto: true,
        puesto: { select: puestoDonacionSelect },
      },
    })

    await tx.auditLog.create({
      data: {
        usuarioId,
        accion: 'DONACION_ESTADO_ACTUALIZADO',
        entidad: 'DONACION',
        entidadId: donacionId,
        datos: {
          estadoAnterior: donacion.estado,
          estadoNuevo: estado,
          puestoId: donacion.puestoId,
        },
      },
    })

    return result
  })

  const tipoEvento = estado === 'EN_CAMINO' ? 'DONACION_EN_CAMINO' : 'DONACION_CANCELADA'
  void appendChainEvent({
    tipo: tipoEvento,
    actorId: usuarioId,
    actorRol: 'VOLUNTARIO',
    entidad: 'donacion',
    entidadId: donacionId,
    payload: {
      donacionId,
      estadoAnterior: donacion.estado,
      estadoNuevo: estado,
      producto: { id: updated.producto.id, nombre: updated.producto.nombre },
      cantidad: updated.cantidad,
      unidad: updated.unidad,
      puestoId: donacion.puestoId,
      puestoNombre: updated.puesto.nombre,
    },
  })

  return updated
}

export async function generarCodigoEntrega(usuarioId: string, donacionId: string) {
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await prisma.donacion.findFirst({
    where: { id: donacionId, voluntarioId: voluntario.id },
    include: {
      producto: true,
      puesto: { select: puestoDonacionSelect },
    },
  })

  if (!donacion) throw notFound('Donacion no encontrada')
  if (donacion.estado !== 'EN_CAMINO') {
    throw badRequest('Solo puedes generar el codigo cuando la donacion esta en camino')
  }

  if (donacion.entregaCodigo) {
    return donacion
  }

  return prisma.donacion.update({
    where: { id: donacionId },
    data: {
      entregaCodigo: `DEL-${randomUUID()}`,
      entregaCodigoGeneradoAt: new Date(),
    },
    include: {
      producto: true,
      puesto: { select: puestoDonacionSelect },
    },
  })
}
