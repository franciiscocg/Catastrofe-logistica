import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { sanitizeUser } from '../auth/auth.service.js'
import { updateManagedUserSchema, updateUserProfileSchema } from './users.schema.js'

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

  app.get('/coordinador', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (_req, reply) => {
    const usuarios = await prisma.usuario.findMany({
      orderBy: [{ activo: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        email: true,
        nombre: true,
        apellidos: true,
        telefono: true,
        roles: true,
        activo: true,
        emailVerified: true,
        createdAt: true,
      },
    })

    return reply.send({ usuarios })
  })

  app.patch('/coordinador/:id', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, async (req, reply) => {
    const coordinadorId = (req.user as { id: string }).id
    const { id } = req.params as { id: string }
    const data = updateManagedUserSchema.parse(req.body ?? {})

    if (id === coordinadorId && data.activo === false) {
      return reply.status(400).send({ error: 'No puedes desactivar tu propia cuenta de coordinador' })
    }
    if (id === coordinadorId && data.roles && !data.roles.includes('COORDINADOR')) {
      return reply.status(400).send({ error: 'No puedes retirar tu propio rol de coordinador' })
    }

    const actual = await prisma.usuario.findUnique({ where: { id }, select: { id: true, roles: true, activo: true } })
    if (!actual) return reply.status(404).send({ error: 'Usuario no encontrado' })

    const usuario = await prisma.$transaction(async (tx) => {
      const updated = await tx.usuario.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          nombre: true,
          apellidos: true,
          telefono: true,
          roles: true,
          activo: true,
          emailVerified: true,
          createdAt: true,
        },
      })

      if (data.roles?.includes('VOLUNTARIO')) {
        await tx.voluntario.upsert({
          where: { usuarioId: id },
          update: {},
          create: { usuarioId: id },
        })
      }
      if (data.activo === false) {
        await tx.refreshToken.updateMany({
          where: { usuarioId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }

      await tx.auditLog.create({
        data: {
          usuarioId: coordinadorId,
          accion: 'GESTIONAR_USUARIO',
          entidad: 'USUARIO',
          entidadId: id,
          datos: { anterior: actual, cambios: data },
        },
      })
      return updated
    })

    return reply.send({ usuario })
  })
}
