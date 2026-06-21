import { procesarColaPendiente } from './chain.js'

const INTERVALO_MS = 15_000 // cada 15 segundos

let timer: ReturnType<typeof setInterval> | null = null
let corriendo = false

async function tick() {
  if (corriendo) return
  corriendo = true
  try {
    await procesarColaPendiente()
  } catch (err) {
    console.error('[chainWorker] Error inesperado en el worker:', err)
  } finally {
    corriendo = false
  }
}

export function startChainWorker() {
  if (timer) return
  timer = setInterval(tick, INTERVALO_MS)
  timer.unref?.()
  // Ejecutar inmediatamente al arrancar para procesar cualquier pendiente
  tick()
  console.log('[chainWorker] Iniciado — procesando cola cada', INTERVALO_MS / 1000, 's')
}

export function stopChainWorker() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
