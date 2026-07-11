import { prisma } from './prisma.js'
import { withDistributedLock } from './distributedLock.js'

const INTERVAL_MS = 60 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let running = false

export async function cleanupExpiredRecords(now = new Date()) {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return result.count
}

async function tick() {
  if (running) return
  running = true
  try {
    const execution = await withDistributedLock('worker:maintenance', 5 * 60 * 1000, cleanupExpiredRecords)
    if (!execution.acquired) return
    const deleted = execution.value ?? 0
    if (deleted > 0) console.log(`[maintenance] Eliminados ${deleted} registros de idempotencia caducados`)
  } catch (error) {
    console.error('[maintenance] Error limpiando registros caducados:', error)
  } finally {
    running = false
  }
}

export function startMaintenanceWorker() {
  if (timer) return
  timer = setInterval(tick, INTERVAL_MS)
  void tick()
}

export function stopMaintenanceWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
