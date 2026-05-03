import { prisma } from '../../lib/prisma.js'
import type { AddItemInput, UpdateCantidadInput } from './inventario.schema.js'

export async function listInventario(puestoId: string) {
  return prisma.inventario.findMany({
    where: { puestoId },
    include: { producto: true },
    orderBy: [{ tipo: 'asc' }, { producto: { nombre: 'asc' } }],
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

  // Si ya existe el registro de inventario para este puesto+producto+tipo, sumar cantidad
  const existing = await prisma.inventario.findUnique({
    where: { puestoId_productoId_tipo: { puestoId, productoId: producto.id, tipo: input.tipo } },
  })

  if (existing) {
    return prisma.inventario.update({
      where: { id: existing.id },
      data: { cantidad: existing.cantidad + input.cantidad },
      include: { producto: true },
    })
  }

  return prisma.inventario.create({
    data: { puestoId, productoId: producto.id, cantidad: input.cantidad, tipo: input.tipo },
    include: { producto: true },
  })
}

export async function updateCantidad(itemId: string, input: UpdateCantidadInput, userId: string) {
  const item = await prisma.inventario.findUnique({ where: { id: itemId } })
  if (!item) throw Object.assign(new Error('Producto no encontrado en el inventario'), { statusCode: 404 })

  await assertPuestoAccess(item.puestoId, userId)

  const nuevaCantidad = input.cantidad !== undefined
    ? input.cantidad
    : Math.max(0, item.cantidad + (input.delta ?? 0))

  return prisma.inventario.update({
    where: { id: itemId },
    data: { cantidad: nuevaCantidad },
    include: { producto: true },
  })
}

export async function deleteItem(itemId: string, userId: string) {
  const item = await prisma.inventario.findUnique({ where: { id: itemId } })
  if (!item) throw Object.assign(new Error('Producto no encontrado en el inventario'), { statusCode: 404 })

  await assertPuestoAccess(item.puestoId, userId)

  return prisma.inventario.delete({ where: { id: itemId } })
}

async function assertPuestoAccess(puestoId: string, userId: string) {
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
    throw Object.assign(new Error('No tienes permiso para gestionar este inventario'), { statusCode: 403 })
  }
}
