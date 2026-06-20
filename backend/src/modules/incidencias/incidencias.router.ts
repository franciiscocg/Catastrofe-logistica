import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  deleteIncidenciaCoordinador,
  deleteVoluntarioIncidenciaCoordinador,
  getMisAsignacionesIncidencia,
  getMiAsignacionIncidenciaActiva,
  getIncidencias,
  getVoluntariosIncidenciaCoordinador,
  patchIncidenciaCoordinador,
  patchIncidenciaEstado,
  postAsignacionIncidencia,
  postComentarioIncidencia,
  postFinalizarAsignacionIncidencia,
  postIncidencia,
} from './incidencias.controller.js'
import { requireAuth, resolveFirebaseAppUser } from '../../middleware/auth.middleware.js'
import { requireRole } from '../../middleware/rbac.middleware.js'
import { isFirebaseAuthEnabled } from '../../lib/firebase-auth.js'

async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.headers.authorization) return

  try {
    if (isFirebaseAuthEnabled()) {
      request.user = await resolveFirebaseAppUser(request.headers.authorization.replace(/^Bearer\s+/i, ''))
    } else {
      await request.jwtVerify()
    }
  } catch {
    // Si el token no es válido, se trata como petición anónima.
  }
}

export async function incidenciasRouter(app: FastifyInstance) {
  app.get('/', getIncidencias)

  app.get('/mis-asignaciones/activa', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, getMiAsignacionIncidenciaActiva)

  app.get('/mis-asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, getMisAsignacionesIncidencia)

  app.post('/', { preHandler: optionalAuth }, postIncidencia)

  app.post('/:id/asignaciones', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, postAsignacionIncidencia)

  app.post('/:id/asignaciones/finalizar', {
    preHandler: [requireAuth, requireRole('VOLUNTARIO')],
  }, postFinalizarAsignacionIncidencia)

  app.post('/:id/comentarios', { preHandler: requireAuth }, postComentarioIncidencia)

  app.patch('/:id/estado', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, patchIncidenciaEstado)

  app.patch('/coordinador/:id', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, patchIncidenciaCoordinador)

  app.delete('/:id', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, deleteIncidenciaCoordinador)

  app.get('/coordinador/:id/voluntarios', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, getVoluntariosIncidenciaCoordinador)

  app.delete('/coordinador/:id/voluntarios/:asignacionId', {
    preHandler: [requireAuth, requireRole('COORDINADOR')],
  }, deleteVoluntarioIncidenciaCoordinador)
}
