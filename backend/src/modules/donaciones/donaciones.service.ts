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
  PENDIENTE: ['EN_CAMINO', 'CANCELADA', 'ENTREGADA'],
  EN_CAMINO: ['CANCELADA', 'ENTREGADA'],
  ENTREGADA: [],
  CANCELADA: [],
}

function assertEstadoTransition(actual: EstadoDonacion, siguiente: EstadoDonacion) {
  if (actual === siguiente) return
  if (!DONACION_TRANSITIONS[actual].includes(siguiente)) {
    throw badRequest(`No se puede cambiar una donación de ${actual} a ${siguiente}.`)
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
      throw badRequest('Esta necesidad ya está cubierta por otras donaciones en camino')
    }

    if (input.cantidad > cantidadPendiente) {
      throw badRequest(`La cantidad supera lo pendiente. Quedan ${cantidadPendiente} ${necesidad.producto.unidad}`)
    }

    return tx.donacion.create({
      data: {
        id: input.clientId,
        voluntarioId: voluntario.id,
        puestoId: input.puestoId,
        productoId: input.productoId,
        cantidad: input.cantidad,
        unidad: input.unidad,
        comentario: input.comentario,
        eta: input.eta ? new Date(input.eta) : undefined,
        estado: input.estadoInicial,
        entregaCodigo: input.entregaCodigo,
        entregaCodigoGeneradoAt: input.entregaCodigo ? new Date() : undefined,
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
    select: {
      id: true,
      estado: true,
      puestoId: true,
      productoId: true,
      cantidad: true,
      unidad: true,
    },
  })

  if (!donacion) throw notFound('Donación no encontrada')
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

    if (estado === 'ENTREGADA') {
      const necesidad = await tx.inventario.findUnique({
        where: {
          puestoId_productoId_tipo: {
            puestoId: donacion.puestoId,
            productoId: donacion.productoId,
            tipo: 'NECESARIO',
          },
        },
        include: { producto: true },
      })

      const cantidadCompensada = Math.min(necesidad?.cantidad ?? 0, donacion.cantidad)
      const cantidadDisponible = Math.max(donacion.cantidad - cantidadCompensada, 0)

      if (necesidad && cantidadCompensada > 0) {
        const updatedNecesidad = await tx.inventario.update({
          where: { id: necesidad.id },
          data: { cantidad: Math.max(necesidad.cantidad - cantidadCompensada, 0) },
          include: { producto: true },
        })
        await tx.auditLog.create({
          data: {
            usuarioId,
            accion: 'INVENTARIO_COMPENSADO',
            entidad: 'PUESTO_INVENTARIO',
            entidadId: donacion.puestoId,
            datos: {
              itemId: updatedNecesidad.id,
              producto: updatedNecesidad.producto,
              tipo: updatedNecesidad.tipo,
              cantidadAnterior: necesidad.cantidad,
              cantidadNueva: updatedNecesidad.cantidad,
              delta: updatedNecesidad.cantidad - necesidad.cantidad,
              donacionId: donacion.id,
            },
          },
        })
      }

      if (cantidadDisponible > 0) {
        const existente = await tx.inventario.findUnique({
          where: {
            puestoId_productoId_tipo: {
              puestoId: donacion.puestoId,
              productoId: donacion.productoId,
              tipo: 'DISPONIBLE',
            },
          },
        })

        const disponible = existente
          ? await tx.inventario.update({
              where: { id: existente.id },
              data: { cantidad: existente.cantidad + cantidadDisponible },
              include: { producto: true },
            })
          : await tx.inventario.create({
              data: {
                puestoId: donacion.puestoId,
                productoId: donacion.productoId,
                cantidad: cantidadDisponible,
                tipo: 'DISPONIBLE',
              },
              include: { producto: true },
            })

        await tx.auditLog.create({
          data: {
            usuarioId,
            accion: 'INVENTARIO_ACTUALIZADO',
            entidad: 'PUESTO_INVENTARIO',
            entidadId: donacion.puestoId,
            datos: {
              itemId: disponible.id,
              producto: disponible.producto,
              tipo: disponible.tipo,
              cantidadAnterior: existente?.cantidad ?? 0,
              cantidadNueva: disponible.cantidad,
              delta: cantidadDisponible,
              donacionId: donacion.id,
            },
          },
        })
      }
    }

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

  let tipoEvento: 'DONACION_EN_CAMINO' | 'DONACION_CANCELADA' | 'DONACION_ENTREGADA' = 'DONACION_CANCELADA'
  if (estado === 'EN_CAMINO') {
    tipoEvento = 'DONACION_EN_CAMINO'
  } else if (estado === 'ENTREGADA') {
    tipoEvento = 'DONACION_ENTREGADA'
  }

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

  if (!donacion) throw notFound('Donación no encontrada')
  if (donacion.estado !== 'PENDIENTE' && donacion.estado !== 'EN_CAMINO') {
    throw badRequest('Solo puedes generar el código cuando la donación está pendiente o en camino')
  }

  if (donacion.entregaCodigo) {
    return donacion
  }

  return prisma.donacion.update({
    where: { id: donacionId },
    data: {
      entregaCodigo: randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
      entregaCodigoGeneradoAt: new Date(),
    },
    include: {
      producto: true,
      puesto: { select: puestoDonacionSelect },
    },
  })
}

export async function updateDonacionCantidad(usuarioId: string, donacionId: string, cantidad: number) {
  if (cantidad <= 0) throw badRequest('La cantidad debe ser mayor que cero')
  const voluntario = await getVoluntarioByUsuario(usuarioId)

  const donacion = await prisma.donacion.findFirst({
    where: { id: donacionId, voluntarioId: voluntario.id },
    select: { id: true, estado: true, puestoId: true, cantidad: true },
  })

  if (!donacion) throw notFound('Donación no encontrada')
  if (donacion.estado !== 'PENDIENTE' && donacion.estado !== 'EN_CAMINO') {
    throw badRequest('Solo se puede modificar la cantidad de donaciones pendientes o en camino')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.donacion.update({
      where: { id: donacionId },
      data: { cantidad },
      include: {
        producto: true,
        puesto: { select: puestoDonacionSelect },
      },
    })

    await tx.auditLog.create({
      data: {
        usuarioId,
        accion: 'DONACION_CANTIDAD_ACTUALIZADA',
        entidad: 'DONACION',
        entidadId: donacionId,
        datos: {
          cantidadAnterior: donacion.cantidad,
          cantidadNueva: cantidad,
          puestoId: donacion.puestoId,
        },
      },
    })

    return result
  })

  void appendChainEvent({
    tipo: 'DONACION_ACTUALIZADA',
    actorId: usuarioId,
    actorRol: 'VOLUNTARIO',
    entidad: 'donacion',
    entidadId: donacionId,
    payload: {
      donacionId,
      cantidadAnterior: donacion.cantidad,
      cantidadNueva: cantidad,
      producto: { id: updated.producto.id, nombre: updated.producto.nombre },
      puestoId: donacion.puestoId,
      puestoNombre: updated.puesto.nombre,
    },
  })

  return updated
}
