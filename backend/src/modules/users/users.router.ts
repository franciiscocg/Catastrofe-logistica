import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { sanitizeUser } from '../auth/auth.service.js'
import { updateUserProfileSchema } from './users.schema.js'

export async function usersRouter(app: FastifyInstance) {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        telefono: true,
        roles: true,
        emailVerified: true,
        createdAt: true,
      },
    })

    if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' })
    return reply.send({ user: sanitizeUser(user), createdAt: user.createdAt })
  })

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = (req.user as { id: string }).id
    const data = updateUserProfileSchema.parse(req.body ?? {})

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          nombre: true,
          apellidos: true,
          telefono: true,
          roles: true,
          emailVerified: true,
        },
      })

      await tx.auditLog.create({
        data: {
          usuarioId: userId,
          accion: 'ACTUALIZAR_PERFIL_USUARIO',
          entidad: 'USUARIO',
          entidadId: userId,
          datos: { camposActualizados: Object.keys(data) },
        },
      })

      return updated
    })

    return reply.send({ user: sanitizeUser(user) })
  })
}
