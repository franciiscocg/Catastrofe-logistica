import { prisma } from '../../lib/prisma.js'
import type { Prisma } from '@prisma/client'
import type { AddItemInput, ConfirmarQrInput, UpdateCantidadInput } from './inventario.schema.js'

function appError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}

type QrProducto = {
  nombre?: string
  productoId?: string
  categoria?: string
  cantidad: number
  unidad: string
}

type QrOperativo =
  | {
      type: 'SOLICITUD_CIUDADANO'
      requestId?: string
      puestoId: string
      puestoNombre?: string
      productos: QrProducto[]
      generatedAt?: string
    }
  | {
      type: 'DONACION_ENTREGA'
      entregaCodigo?: string
      donacionId?: string
      puestoId: string
      productoId: string
      productoNombre?: string
      productoCategoria?: string
      cantidad: number
      unidad: string
      generatedAt?: string
    }

function normalizeProductoNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es')
}

function assertCantidadValida(cantidad: unknown) {
  return typeof cantidad === 'number' && Number.isFinite(cantidad) && cantidad > 0
}

function generatedAtFromTimestamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseQrOperativo(text: string): QrOperativo {
  let data: Partial<QrOperativo> & {
    t?: string
    r?: string
    p?: string
    pn?: string
    i?: Array<{ n?: string; c?: string; q?: number; u?: string }>
    e?: string
    d?: string
    pr?: string
    n?: string
    c?: string
    q?: number
    u?: string
    g?: number
  }

  try {
    data = JSON.parse(text)
  } catch {
    throw appError('El QR no tiene un formato valido', 400)
  }

  if (data.t === 'SC' && data.p && Array.isArray(data.i)) {
    if (!data.r) {
      throw appError('Este QR de solicitud es antiguo y no tiene codigo de un solo uso. Genera un QR nuevo.', 400)
    }

    const productos = data.i
      .filter((item) => item.n && item.u && assertCantidadValida(item.q))
      .map((item) => ({
        nombre: item.n,
        categoria: item.c,
        cantidad: item.q!,
        unidad: item.u!,
      }))

    if (productos.length === 0) throw appError('El QR no incluye productos validos', 400)

    return {
      type: 'SOLICITUD_CIUDADANO',
      requestId: data.r,
      puestoId: data.p,
      puestoNombre: data.pn,
      productos,
      generatedAt: generatedAtFromTimestamp(data.g),
    }
  }

  if (data.t === 'DE' && data.p && data.pr && data.u && assertCantidadValida(data.q)) {
    if (!data.e || !data.d) throw appError('El QR de donacion no incluye codigo de entrega', 400)

    return {
      type: 'DONACION_ENTREGA',
      entregaCodigo: data.e,
      donacionId: data.d,
      puestoId: data.p,
      productoId: data.pr,
      productoNombre: data.n,
      productoCategoria: data.c,
      cantidad: data.q!,
      unidad: data.u,
      generatedAt: generatedAtFromTimestamp(data.g),
    }
  }

  if (data.type === 'SOLICITUD_CIUDADANO' && data.puestoId && Array.isArray(data.productos)) {
    if (!data.requestId) {
      throw appError('Este QR de solicitud es antiguo y no tiene codigo de un solo uso. Genera un QR nuevo.', 400)
    }
    const productos = data.productos.filter((item) =>
      item.nombre && item.unidad && assertCantidadValida(item.cantidad)
    )
    if (productos.length === 0) throw appError('El QR no incluye productos validos', 400)
    return { ...data, productos } as QrOperativo
  }

  if (
    data.type === 'DONACION_ENTREGA' &&
    data.puestoId &&
    data.productoId &&
    data.entregaCodigo &&
    data.donacionId &&
    assertCantidadValida(data.cantidad)
  ) {
    return data as QrOperativo
  }

  throw appError('Formato de QR no reconocido', 400)
}

export async function listInventario(puestoId: string) {
  return prisma.inventario.findMany({
    where: { puestoId },
    include: { producto: true },
    orderBy: [{ tipo: 'asc' }, { producto: { nombre: 'asc' } }],
  })
}

export async function listInventarioHistorial(puestoId: string, userId: string) {
  await assertPuestoResponsableAccess(puestoId, userId)

  return prisma.auditLog.findMany({
    where: {
      entidad: 'PUESTO_INVENTARIO',
      entidadId: puestoId,
    },
    include: {
      usuario: {
        select: { id: true, nombre: true, apellidos: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })
}

export async function addItem(puestoId: string, input: AddItemInput, userId: string) {
  await assertPuestoAccess(puestoId, userId)

  // Buscar o crear el producto por nombre (case-insensitive)
  let producto = await prisma.producto.findFirst({
    where: { nombre: { equals: input.nombre, mode: 'insensitive' } },
  })

  if (!producto) {
    producto = await prisma.producto.create({
      data: { nombre: input.nombre, categoria: input.categoria, unidad: input.unidad },
    })
  }

  const oppositeType = input.tipo === 'NECESARIO' ? 'DISPONIBLE' : 'NECESARIO'
  const opposite = await prisma.inventario.findUnique({
    where: { puestoId_productoId_tipo: { puestoId, productoId: producto.id, tipo: oppositeType } },
    include: { producto: true },
  })

  const cantidadCompensada = Math.min(opposite?.cantidad ?? 0, input.cantidad)
  const cantidadRestante = Math.max(input.cantidad - cantidadCompensada, 0)

  if (opposite && cantidadCompensada > 0) {
    const updatedOpposite = await prisma.inventario.update({
      where: { id: opposite.id },
      data: { cantidad: Math.max(opposite.cantidad - cantidadCompensada, 0) },
      include: { producto: true },
    })
    await registrarMovimientoInventario(puestoId, userId, 'INVENTARIO_COMPENSADO', {
      itemId: updatedOpposite.id,
      producto: updatedOpposite.producto,
      tipo: updatedOpposite.tipo,
      cantidadAnterior: opposite.cantidad,
      cantidadNueva: updatedOpposite.cantidad,
      delta: updatedOpposite.cantidad - opposite.cantidad,
      motivo: input.tipo,
    })

    if (cantidadRestante <= 0) return updatedOpposite
  }

  const existing = await prisma.inventario.findUnique({
    where: { puestoId_productoId_tipo: { puestoId, productoId: producto.id, tipo: input.tipo } },
  })

  if (existing) {
    const item = await prisma.inventario.update({
      where: { id: existing.id },
      data: { cantidad: existing.cantidad + cantidadRestante },
      include: { producto: true },
    })
    await registrarMovimientoInventario(puestoId, userId, 'INVENTARIO_INCREMENTADO', {
      itemId: item.id,
      producto: item.producto,
      tipo: item.tipo,
      cantidadAnterior: existing.cantidad,
      cantidadNueva: item.cantidad,
      delta: cantidadRestante,
    })
    return item
  }

  const item = await prisma.inventario.create({
    data: { puestoId, productoId: producto.id, cantidad: cantidadRestante, tipo: input.tipo },
    include: { producto: true },
  })
  await registrarMovimientoInventario(puestoId, userId, 'INVENTARIO_CREADO', {
    itemId: item.id,
    producto: item.producto,
    tipo: item.tipo,
    cantidadAnterior: 0,
    cantidadNueva: item.cantidad,
    delta: item.cantidad,
  })
  return item
}

export async function updateCantidad(itemId: string, input: UpdateCantidadInput, userId: string) {
  const item = await prisma.inventario.findUnique({ where: { id: itemId } })
  if (!item) throw Object.assign(new Error('Producto no encontrado en el inventario'), { statusCode: 404 })

  await assertPuestoAccess(item.puestoId, userId)

  const nuevaCantidad = input.cantidad !== undefined
    ? input.cantidad
    : Math.max(0, item.cantidad + (input.delta ?? 0))

  return prisma.$transaction(async (tx) => {
    let cantidadFinal = nuevaCantidad
    const oppositeType = item.tipo === 'NECESARIO' ? 'DISPONIBLE' : 'NECESARIO'
    const cantidadAnadida = Math.max(nuevaCantidad - item.cantidad, 0)

    if (cantidadAnadida > 0) {
      const opposite = await tx.inventario.findUnique({
        where: {
          puestoId_productoId_tipo: {
            puestoId: item.puestoId,
            productoId: item.productoId,
            tipo: oppositeType,
          },
        },
        include: { producto: true },
      })

      const cantidadCompensada = Math.min(opposite?.cantidad ?? 0, cantidadAnadida)
      if (opposite && cantidadCompensada > 0) {
        const updatedOpposite = await tx.inventario.update({
          where: { id: opposite.id },
          data: { cantidad: Math.max(opposite.cantidad - cantidadCompensada, 0) },
          include: { producto: true },
        })
        await registrarMovimientoInventarioTx(tx, item.puestoId, userId, 'INVENTARIO_COMPENSADO', {
          itemId: updatedOpposite.id,
          producto: updatedOpposite.producto,
          tipo: updatedOpposite.tipo,
          cantidadAnterior: opposite.cantidad,
          cantidadNueva: updatedOpposite.cantidad,
          delta: updatedOpposite.cantidad - opposite.cantidad,
          motivo: item.tipo,
        })
        cantidadFinal = nuevaCantidad - cantidadCompensada
      }
    }

    const updated = await tx.inventario.update({
      where: { id: itemId },
      data: { cantidad: cantidadFinal },
      include: { producto: true },
    })
    await registrarMovimientoInventarioTx(tx, item.puestoId, userId, 'INVENTARIO_ACTUALIZADO', {
      itemId: updated.id,
      producto: updated.producto,
      tipo: updated.tipo,
      cantidadAnterior: item.cantidad,
      cantidadNueva: updated.cantidad,
      delta: updated.cantidad - item.cantidad,
      cantidadSolicitada: nuevaCantidad,
    })
    return updated
  })
}

export async function confirmarQrInventario(puestoId: string, input: ConfirmarQrInput, userId: string) {
  await assertPuestoAccess(puestoId, userId)

  const qr = parseQrOperativo(input.codigo)
  if (qr.puestoId !== puestoId) {
    throw appError('Este QR pertenece a otro puesto', 400)
  }

  return prisma.$transaction(async (tx) => {
    if (qr.type === 'SOLICITUD_CIUDADANO') {
      const alreadyUsed = await tx.auditLog.findFirst({
        where: {
          accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
          entidad: 'QR_SOLICITUD_CIUDADANO',
          entidadId: qr.requestId,
        },
        select: { id: true },
      })
      if (alreadyUsed) {
        throw appError('Este QR de solicitud ya se ha usado. Pide al ciudadano que genere uno nuevo.', 409)
      }

      const inventario = await tx.inventario.findMany({
        where: { puestoId, tipo: 'DISPONIBLE' },
        include: { producto: true },
      })

      const solicitudes = new Map<string, QrProducto>()
      for (const producto of qr.productos) {
        const nombre = producto.nombre?.trim()
        if (!nombre) throw appError('El QR incluye un producto sin nombre', 400)
        const key = normalizeProductoNombre(nombre)
        const current = solicitudes.get(key)
        solicitudes.set(key, current
          ? { ...current, cantidad: current.cantidad + producto.cantidad }
          : { ...producto, nombre })
      }

      const movimientos = []
      for (const producto of solicitudes.values()) {
        const item = inventario.find((inv) =>
          normalizeProductoNombre(inv.producto.nombre) === normalizeProductoNombre(producto.nombre ?? '')
        )

        if (!item) {
          throw appError(`No encuentro "${producto.nombre}" en el inventario disponible`, 404)
        }
        if (item.cantidad < producto.cantidad) {
          throw appError(`Stock insuficiente de ${item.producto.nombre}. Disponible: ${item.cantidad} ${item.producto.unidad}`, 400)
        }

        const updatedCount = await tx.inventario.updateMany({
          where: { id: item.id, cantidad: { gte: producto.cantidad } },
          data: { cantidad: { decrement: producto.cantidad } },
        })
        if (updatedCount.count !== 1) {
          throw appError(`Stock insuficiente de ${item.producto.nombre}`, 400)
        }

        const updated = await tx.inventario.findUniqueOrThrow({
          where: { id: item.id },
          include: { producto: true },
        })
        await registrarMovimientoInventarioTx(tx, puestoId, userId, 'QR_SOLICITUD_CIUDADANO_CONFIRMADA', {
          itemId: updated.id,
          producto: updated.producto,
          tipo: updated.tipo,
          cantidadAnterior: item.cantidad,
          cantidadNueva: updated.cantidad,
          delta: updated.cantidad - item.cantidad,
          qrGeneratedAt: qr.generatedAt,
          qrRequestId: qr.requestId,
        })
        movimientos.push(updated)
      }

      await tx.auditLog.create({
        data: {
          usuarioId: userId,
          accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
          entidad: 'QR_SOLICITUD_CIUDADANO',
          entidadId: qr.requestId!,
          datos: {
            puestoId,
            productos: qr.productos as unknown as Prisma.InputJsonValue,
            qrGeneratedAt: qr.generatedAt,
          },
        },
      })

      return { tipo: qr.type, productos: movimientos }
    }

    const donacion = await tx.donacion.findFirst({
      where: {
        id: qr.donacionId,
        entregaCodigo: qr.entregaCodigo,
        puestoId,
        productoId: qr.productoId,
        estado: 'EN_CAMINO',
      },
      include: { producto: true },
    })

    if (!donacion) {
      throw appError('Este QR de donacion no se puede confirmar: no existe, ya fue usado o la donacion no esta en camino.', 409)
    }
    if (donacion.cantidad !== qr.cantidad || donacion.unidad !== qr.unidad) {
      throw appError('El contenido del QR no coincide con la donacion registrada', 400)
    }

    const necesidad = await tx.inventario.findUnique({
      where: {
        puestoId_productoId_tipo: {
          puestoId,
          productoId: donacion.productoId,
          tipo: 'NECESARIO',
        },
      },
      include: { producto: true },
    })

    const cantidadCompensada = Math.min(necesidad?.cantidad ?? 0, donacion.cantidad)
    const cantidadDisponible = Math.max(donacion.cantidad - cantidadCompensada, 0)
    const productos = []

    if (necesidad && cantidadCompensada > 0) {
      const updatedNecesidad = await tx.inventario.update({
        where: { id: necesidad.id },
        data: { cantidad: Math.max(necesidad.cantidad - cantidadCompensada, 0) },
        include: { producto: true },
      })
      await registrarMovimientoInventarioTx(tx, puestoId, userId, 'QR_DONACION_COMPENSADA', {
        itemId: updatedNecesidad.id,
        producto: updatedNecesidad.producto,
        tipo: updatedNecesidad.tipo,
        cantidadAnterior: necesidad.cantidad,
        cantidadNueva: updatedNecesidad.cantidad,
        delta: updatedNecesidad.cantidad - necesidad.cantidad,
        donacionId: donacion.id,
        entregaCodigo: donacion.entregaCodigo,
      })
      productos.push(updatedNecesidad)
    }

    if (cantidadDisponible > 0) {
      const existente = await tx.inventario.findUnique({
        where: {
          puestoId_productoId_tipo: {
            puestoId,
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
              puestoId,
              productoId: donacion.productoId,
              cantidad: cantidadDisponible,
              tipo: 'DISPONIBLE',
            },
            include: { producto: true },
          })

      await registrarMovimientoInventarioTx(tx, puestoId, userId, 'QR_DONACION_CONFIRMADA', {
        itemId: disponible.id,
        producto: disponible.producto,
        tipo: disponible.tipo,
        cantidadAnterior: existente?.cantidad ?? 0,
        cantidadNueva: disponible.cantidad,
        delta: cantidadDisponible,
        donacionId: donacion.id,
        entregaCodigo: donacion.entregaCodigo,
      })
      productos.push(disponible)
    }

    const donacionActualizada = await tx.donacion.update({
      where: { id: donacion.id },
      data: { estado: 'ENTREGADA' },
      include: { producto: true, puesto: true },
    })

    return { tipo: qr.type, donacion: donacionActualizada, productos }
  })
}

export async function getEstadoSolicitudQr(requestId: string) {
  const solicitudConfirmada = await prisma.auditLog.findFirst({
    where: {
      accion: 'QR_SOLICITUD_CIUDADANO_CONFIRMADA',
      entidad: 'QR_SOLICITUD_CIUDADANO',
      entidadId: requestId,
    },
    select: { createdAt: true },
  })

  if (!solicitudConfirmada) return { estado: 'PENDIENTE' as const }

  return {
    estado: 'COMPLETADA' as const,
    completedAt: solicitudConfirmada.createdAt,
  }
}

export async function deleteItem(itemId: string, userId: string) {
  const item = await prisma.inventario.findUnique({
    where: { id: itemId },
    include: { producto: true },
  })
  if (!item) throw Object.assign(new Error('Producto no encontrado en el inventario'), { statusCode: 404 })

  await assertPuestoAccess(item.puestoId, userId)

  const deleted = await prisma.inventario.delete({ where: { id: itemId } })
  await registrarMovimientoInventario(item.puestoId, userId, 'INVENTARIO_ELIMINADO', {
    itemId: item.id,
    producto: item.producto,
    tipo: item.tipo,
    cantidadAnterior: item.cantidad,
    cantidadNueva: 0,
    delta: -item.cantidad,
  })
  return deleted
}

async function registrarMovimientoInventario(
  puestoId: string,
  userId: string,
  accion: string,
  datos: Prisma.InputJsonObject,
) {
  await prisma.auditLog.create({
    data: {
      usuarioId: userId,
      accion,
      entidad: 'PUESTO_INVENTARIO',
      entidadId: puestoId,
      datos,
    },
  })
}

async function registrarMovimientoInventarioTx(
  tx: Prisma.TransactionClient,
  puestoId: string,
  userId: string,
  accion: string,
  datos: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      usuarioId: userId,
      accion,
      entidad: 'PUESTO_INVENTARIO',
      entidadId: puestoId,
      datos,
    },
  })
}

async function assertPuestoAccess(puestoId: string, userId: string) {
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id: puestoId },
    select: {
      adminId: true,
      trabajadores: { where: { usuarioId: userId }, select: { id: true } },
      asignacionesVoluntarios: {
        where: {
          estado: 'ACTIVA',
          voluntario: { usuarioId: userId },
        },
        select: { id: true },
      },
    },
  })
  if (!puesto) throw Object.assign(new Error('Puesto no encontrado'), { statusCode: 404 })

  const esAdmin = puesto.adminId === userId
  const esTrabajador = puesto.trabajadores.length > 0
  const esVoluntarioActivo = puesto.asignacionesVoluntarios.length > 0

  if (!esAdmin && !esTrabajador && !esVoluntarioActivo) {
    throw Object.assign(new Error('No tienes permiso para gestionar este inventario'), { statusCode: 403 })
  }
}

async function assertPuestoResponsableAccess(puestoId: string, userId: string) {
  const puesto = await prisma.puestoEmergencia.findUnique({
    where: { id: puestoId },
    select: {
      adminId: true,
      trabajadores: { where: { usuarioId: userId }, select: { id: true } },
    },
  })
  if (!puesto) throw Object.assign(new Error('Puesto no encontrado'), { statusCode: 404 })

  const esAdmin = puesto.adminId === userId
  const esTrabajador = puesto.trabajadores.length > 0

  if (!esAdmin && !esTrabajador) {
    throw Object.assign(new Error('No tienes permiso para consultar el historial del inventario'), { statusCode: 403 })
  }
}
