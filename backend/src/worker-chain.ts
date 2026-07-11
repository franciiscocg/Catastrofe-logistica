import { prisma } from './lib/prisma.js'
import { redis } from './lib/redis.js'
import { startChainWorker, stopChainWorker } from './lib/chainWorker.js'

startChainWorker()

async function shutdown(signal: string) {
  console.log(`[chainWorker] Recibida ${signal}; cerrando`)
  await stopChainWorker()
  if (redis.status !== 'end') await redis.quit()
  await prisma.$disconnect()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
