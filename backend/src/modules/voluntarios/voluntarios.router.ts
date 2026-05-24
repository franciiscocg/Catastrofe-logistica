import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'

function getUsuarioId(user: unknown) {
  const authUser = user as { sub?: string; id?: string } | undefined
  return authUser?.sub ?? authUser?.id
}

function cleanOptionalText(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function voluntariosRouter(app: FastifyInstance) {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const usuarioId = getUsuarioId(req.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const voluntario = await prisma.voluntario.upsert({
      where: { usuarioId },
      update: {},
      create: { usuarioId },
      include: {
        usuario: {
          select: { id: true, nombre: true, apellidos: true, email: true, telefono: true },
        },
      },
    })

    return reply.send({ voluntario })
  })

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const usuarioId = getUsuarioId(req.user)
    if (!usuarioId) return reply.status(401).send({ error: 'No autenticado' })

    const body = (req.body ?? {}) as { modalidad?: unknown; vehiculo?: unknown }
    const data: { modalidad?: string | null; vehiculo?: Prisma.InputJsonValue } = {}
    const modalidad = cleanOptionalText(body.modalidad)
    if (modalidad !== undefined) data.modalidad = modalidad
    if (body.vehiculo !== undefined) data.vehiculo = body.vehiculo as Prisma.InputJsonValue

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'No hay cambios para guardar' })
    }

    const voluntario = await prisma.voluntario.upsert({
      where: { usuarioId },
      update: data,
      create: { usuarioId, ...data },
      include: {
        usuario: {
          select: { id: true, nombre: true, apellidos: true, email: true, telefono: true },
        },
      },
    })

    return reply.send({ voluntario })
  })
}
