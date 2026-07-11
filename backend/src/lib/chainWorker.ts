import { procesarColaPendiente } from './chain.js'
import { withDistributedLock } from './distributedLock.js'

const INTERVALO_MS = 15_000 // cada 15 segundos

let timer: ReturnType<typeof setInterval> | null = null
let activeTick: Promise<void> | null = null

async function tick() {
  try {
    await withDistributedLock('worker:chain', 60_000, procesarColaPendiente)
  } catch (err) {
    console.error('[chainWorker] Error inesperado en el worker:', err)
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

export function startChainWorker() {
  if (timer) return
  timer = setInterval(triggerTick, INTERVALO_MS)
  // Ejecutar inmediatamente al arrancar para procesar cualquier pendiente
  triggerTick()
  console.log('[chainWorker] Iniciado — procesando cola cada', INTERVALO_MS / 1000, 's')
}

export async function stopChainWorker(timeoutMs = 15_000) {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (activeTick) await waitForActiveTick(activeTick, timeoutMs)
}

async function waitForActiveTick(execution: Promise<void>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    execution,
    new Promise<void>((resolve) => { timeout = setTimeout(resolve, timeoutMs) }),
  ])
  if (timeout) clearTimeout(timeout)
}
