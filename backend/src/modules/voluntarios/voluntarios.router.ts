import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { updateVoluntarioProfileSchema } from './voluntarios.schema.js'

function getUsuarioId(user: unknown) {
  const authUser = user as { sub?: string; id?: string } | undefined
  return authUser?.sub ?? authUser?.id
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

    const body = updateVoluntarioProfileSchema.parse(req.body ?? {})
    const data: { modalidad?: string | null; vehiculo?: Prisma.InputJsonValue } = {}
    if (body.modalidad !== undefined) data.modalidad = body.modalidad
    if (body.vehiculo !== undefined) data.vehiculo = body.vehiculo as Prisma.InputJsonValue

    const voluntario = await prisma.$transaction(async (tx) => {
      const updated = await tx.voluntario.upsert({
        where: { usuarioId },
        update: data,
        create: { usuarioId, ...data },
        include: {
          usuario: {
            select: { id: true, nombre: true, apellidos: true, email: true, telefono: true },
          },
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId,
          accion: 'ACTUALIZAR_PERFIL_VOLUNTARIO',
          entidad: 'VOLUNTARIO',
          entidadId: updated.id,
          datos: { camposActualizados: Object.keys(data) },
        },
      })

      return updated
    })

    return reply.send({ voluntario })
  })
}
