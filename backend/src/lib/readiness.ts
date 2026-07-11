import type { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import { prisma } from './prisma.js'
import { redis } from './redis.js'

type Database = Pick<PrismaClient, '$queryRaw'> & {
  pendingChainEvent: Pick<PrismaClient['pendingChainEvent'], 'count'>
}

export async function checkReadiness(
  database: Database = prisma,
  cache: Pick<Redis, 'ping'> = redis,
) {
  const startedAt = Date.now()
  const [databaseResult, redisResult] = await Promise.allSettled([
    database.$queryRaw`SELECT 1`,
    cache.ping(),
  ])
  const databaseReady = databaseResult.status === 'fulfilled'
  const redisReady = redisResult.status === 'fulfilled' && redisResult.value === 'PONG'
  let pendingChainEvents: number | null = null

  if (databaseReady) {
    try {
      pendingChainEvents = await database.pendingChainEvent.count({ where: { intentos: { lt: 5 } } })
    } catch {
      return result(false, true, redisReady, null, startedAt)
    }
  }

  return result(databaseReady && redisReady, databaseReady, redisReady, pendingChainEvents, startedAt)
}

function result(ready: boolean, databaseReady: boolean, redisReady: boolean, pending: number | null, startedAt: number) {
  return {
    ready,
    body: {
      status: ready ? 'ready' : 'not_ready',
      database: databaseReady ? 'ok' : 'unavailable',
      redis: redisReady ? 'ok' : 'unavailable',
      pendingChainEvents: pending,
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
  }
}
