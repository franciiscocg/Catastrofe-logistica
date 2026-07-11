import { prisma } from './prisma.js'
import { withDistributedLock } from './distributedLock.js'

const INTERVAL_MS = 60 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let activeTick: Promise<void> | null = null

export async function cleanupExpiredRecords(now = new Date()) {
  const result = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return result.count
}

async function tick() {
  try {
    const execution = await withDistributedLock('worker:maintenance', 5 * 60 * 1000, cleanupExpiredRecords)
    if (!execution.acquired) return
    const deleted = execution.value ?? 0
    if (deleted > 0) console.log(`[maintenance] Eliminados ${deleted} registros de idempotencia caducados`)
  } catch (error) {
    console.error('[maintenance] Error limpiando registros caducados:', error)
  }
}

function triggerTick() {
  if (activeTick) return
  const execution = tick()
  activeTick = execution
  void execution.finally(() => {
    if (activeTick === execution) activeTick = null
  })
}

export function startMaintenanceWorker() {
  if (timer) return
  timer = setInterval(triggerTick, INTERVAL_MS)
  triggerTick()
}

export async function stopMaintenanceWorker(timeoutMs = 15_000) {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!activeTick) return
  let timeout: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    activeTick,
    new Promise<void>((resolve) => { timeout = setTimeout(resolve, timeoutMs) }),
  ])
  if (timeout) clearTimeout(timeout)
}
