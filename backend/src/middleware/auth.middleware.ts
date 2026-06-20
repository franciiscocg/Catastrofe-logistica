import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { isFirebaseAuthEnabled, verifyFirebaseIdToken } from '../lib/firebase-auth.js'

export async function resolveFirebaseAppUser(idToken: string) {
  const claims = await verifyFirebaseIdToken(idToken)
  const user = await prisma.usuario.findFirst({
    where: {
      OR: [
        { firebaseUid: claims.uid },
        ...(claims.email ? [{ email: claims.email.toLowerCase() }] : []),
      ],
    },
  })
  if (!user || !user.activo) throw Object.assign(new Error('No autenticado'), { statusCode: 401 })

  if (!user.firebaseUid || (claims.emailVerified && !user.emailVerified)) {
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        firebaseUid: claims.uid,
        ...(claims.emailVerified && !user.emailVerified
          ? { emailVerified: true, emailVerifiedAt: new Date() }
          : {}),
      },
    })
  }

  return {
    sub: user.id,
    id: user.id,
    email: user.email,
    roles: user.roles,
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (isFirebaseAuthEnabled()) {
      const authorization = request.headers.authorization
      if (!authorization?.startsWith('Bearer ')) throw new Error('Token ausente')
      request.user = await resolveFirebaseAppUser(authorization.slice(7))
      return
    }
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'No autenticado' })
  }
}
