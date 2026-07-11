import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
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
import { checkReadiness } from './lib/readiness.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { env } from './config/env.js'

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
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
        // El frontend se sirve desde este mismo proceso en produccion. Mantener
        // una lista explicita permite los recursos del mapa sin relajar la CSP
        // para el resto de proveedores externos.
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https:',
          'ws:',
          'wss:',
        ],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
  })
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  })
  await app.register(cookie)
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'production' ? 100 : 5000,
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

  // Liveness: confirma que el proceso responde, sin depender de servicios externos.
  app.get('/health', async () => ({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }))

  // Readiness: solo devuelve 200 cuando la base de datos está disponible.
  app.get('/ready', async (_request, reply) => {
    const output = await checkReadiness()
    return reply.status(output.ready ? 200 : 503).send(output.body)
  })

  const frontendRoot = path.resolve(process.cwd(), '../frontend/dist')
  if (env.NODE_ENV === 'production' && existsSync(frontendRoot)) {
    await app.register(fastifyStatic, { root: frontendRoot, serve: false })
    app.get('/*', async (request, reply) => {
      const requestedPath = (request.params as { '*': string })['*']
      const safePath = requestedPath.replace(/^\/+/, '')
      if (safePath === 'api' || safePath.startsWith('api/')) {
        return reply.status(404).send({ error: 'Ruta API no encontrada' })
      }
      const candidatePath = path.resolve(frontendRoot, safePath)
      if (safePath && candidatePath.startsWith(`${frontendRoot}${path.sep}`) && existsSync(candidatePath)) {
        return reply.sendFile(safePath)
      }
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  }

  return app
}
