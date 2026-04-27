import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import { authRouter } from './modules/auth/auth.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { catastrofesRouter } from './modules/catastrofes/catastrofes.router.js'
import { puestosRouter } from './modules/puestos/puestos.router.js'
import { inventarioRouter } from './modules/inventario/inventario.router.js'
import { voluntariosRouter } from './modules/voluntarios/voluntarios.router.js'
import { errorHandler } from './middleware/error.middleware.js'

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  // Seguridad
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // Auth
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-prod',
  })

  // Rutas
  await app.register(authRouter, { prefix: '/api/auth' })
  await app.register(usersRouter, { prefix: '/api/users' })
  await app.register(catastrofesRouter, { prefix: '/api/catastrofes' })
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  await app.register(inventarioRouter, { prefix: '/api/inventario' })
  await app.register(voluntariosRouter, { prefix: '/api/voluntarios' })

  // Healthcheck
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  app.setErrorHandler(errorHandler)

  return app
}
