import { prisma } from '../../lib/prisma.js'
import type { Prisma } from '@prisma/client'
import type { AddItemInput, UpdateCantidadInput } from './inventario.schema.js'

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

  const updated = await prisma.inventario.update({
    where: { id: itemId },
    data: { cantidad: nuevaCantidad },
    include: { producto: true },
  })
  await registrarMovimientoInventario(item.puestoId, userId, 'INVENTARIO_ACTUALIZADO', {
    itemId: updated.id,
    producto: updated.producto,
    tipo: updated.tipo,
    cantidadAnterior: item.cantidad,
    cantidadNueva: updated.cantidad,
    delta: updated.cantidad - item.cantidad,
  })
  return updated
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
