import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import { authRouter } from './modules/auth/auth.router.js'
import { usersRouter } from './modules/users/users.router.js'
import { puestosRouter } from './modules/puestos/puestos.router.js'
import { inventarioRouter } from './modules/inventario/inventario.router.js'
import { voluntariosRouter } from './modules/voluntarios/voluntarios.router.js'
import { incidenciasRouter } from './modules/incidencias/incidencias.router.js'
import { donacionesRouter } from './modules/donaciones/donaciones.router.js'
import { auditRouter } from './modules/audit/audit.router.js'
import { errorHandler } from './middleware/error.middleware.js'
import { registerIdempotency } from './middleware/idempotency.middleware.js'
import { getJwtSecret } from './lib/security.js'

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  app.setErrorHandler(errorHandler)

  // Seguridad
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  })
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    max: process.env.NODE_ENV === 'production' ? 100 : 5000,
    timeWindow: '1 minute',
  })

  // Auth
  await app.register(jwt, {
    secret: getJwtSecret(),
  })

  await registerIdempotency(app)

  // Rutas
  await app.register(authRouter, { prefix: '/api/auth' })
  await app.register(usersRouter, { prefix: '/api/users' })
  await app.register(puestosRouter, { prefix: '/api/puestos' })
  await app.register(inventarioRouter, { prefix: '/api/inventario' })
  await app.register(voluntariosRouter, { prefix: '/api/voluntarios' })
  await app.register(incidenciasRouter, { prefix: '/api/incidencias' })
  await app.register(donacionesRouter, { prefix: '/api/donaciones' })
  await app.register(auditRouter, { prefix: '/api/public/audit' })

  // Healthcheck
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return app
}
