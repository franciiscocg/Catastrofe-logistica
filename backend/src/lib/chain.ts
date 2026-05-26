import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { timestampHash } from './tsa.js'

export type TipoEvento =
  | 'DONACION_CREADA'
  | 'DONACION_EN_CAMINO'
  | 'DONACION_ENTREGADA'
  | 'DONACION_CANCELADA'
  | 'INVENTARIO_ENTRADA'
  | 'INVENTARIO_SALIDA'
  | 'INVENTARIO_ACTUALIZADO'

export interface ChainEventInput {
  tipo: TipoEvento
  actorId?: string
  actorRol?: string
  entidad: string
  entidadId: string
  payload: Prisma.InputJsonObject
}

// ── Constantes ────────────────────────────────────────────────────────────────

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'
const MAX_INTENTOS = 5

// Backoff exponencial: intento 1→10s, 2→30s, 3→2min, 4→10min, 5→30min
const BACKOFF_MS = [10_000, 30_000, 120_000, 600_000, 1_800_000]

// ── Hash helpers ──────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function computeEventHash(
  sequence: number,
  tipo: string,
  entidad: string,
  entidadId: string,
  payload: Record<string, unknown>,
  hashPrevio: string,
  createdAt: Date,
): string {
  const canonical = JSON.stringify({ sequence, tipo, entidad, entidadId, payload, hashPrevio, createdAt: createdAt.toISOString() })
  return sha256(canonical)
}

// ── Core: escribir evento en la cadena ───────────────────────────────────────

async function writeToChain(input: ChainEventInput) {
  return prisma.$transaction(
    async (tx) => {
      const last = await tx.chainEvent.findFirst({
        orderBy: { sequence: 'desc' },
        select: { sequence: true, hashPropio: true },
      })

      const hashPrevio = last?.hashPropio ?? GENESIS_HASH
      const nextSequence = (last?.sequence ?? 0) + 1
      const createdAt = new Date()

      const hashPropio = computeEventHash(
        nextSequence,
        input.tipo,
        input.entidad,
        input.entidadId,
        input.payload,
        hashPrevio,
        createdAt,
      )

      return tx.chainEvent.create({
        data: {
          sequence: nextSequence,
          tipo: input.tipo,
          actorId: input.actorId,
          actorRol: input.actorRol,
          entidad: input.entidad,
          entidadId: input.entidadId,
          payload: input.payload,
          hashPrevio,
          hashPropio,
          createdAt,
        },
      })
    },
    { isolationLevel: 'Serializable' },
  )
}

// ── Cola de reintentos ────────────────────────────────────────────────────────

async function encolar(input: ChainEventInput, error: unknown) {
  const mensaje = error instanceof Error ? error.message : String(error)
  try {
    await prisma.pendingChainEvent.create({
      data: { payload: input as unknown as Prisma.InputJsonObject, ultimoError: mensaje },
    })
  } catch {
    // Si ni siquiera podemos encolar, el problema es grave (DB caída).
    // No hay nada más que hacer — el evento se perderá, pero quedará
    // evidencia en los logs del servidor.
    console.error('[chain] No se pudo encolar evento fallido:', mensaje)
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Registra un evento en la cadena de custodia.
 * Si falla, lo guarda en la cola de reintentos en lugar de descartarlo.
 * No lanza excepciones — es seguro llamar con .catch(() => {}) eliminado.
 */
export async function appendChainEvent(input: ChainEventInput): Promise<void> {
  try {
    const event = await writeToChain(input)
    stampEventAsync(event.id, event.hashPropio)
  } catch (err) {
    await encolar(input, err)
  }
}

// ── TSA async ─────────────────────────────────────────────────────────────────

async function stampEventAsync(eventId: string, hashPropio: string) {
  try {
    const { token, timestamp } = await timestampHash(hashPropio)
    await prisma.chainEvent.update({
      where: { id: eventId },
      data: { tsaToken: token, tsaTimestamp: timestamp },
    })
  } catch {
    // TSA es best-effort; la integridad la garantiza el hash-chain
  }
}

// ── Worker: procesar cola ─────────────────────────────────────────────────────

export async function procesarColaPendiente(): Promise<void> {
  const pendientes = await prisma.pendingChainEvent.findMany({
    where: {
      intentos: { lt: MAX_INTENTOS },
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  for (const pending of pendientes) {
    const input = pending.payload as unknown as ChainEventInput

    try {
      const event = await writeToChain(input)
      stampEventAsync(event.id, event.hashPropio)
      await prisma.pendingChainEvent.delete({ where: { id: pending.id } })
    } catch (err) {
      const nuevosIntentos = pending.intentos + 1
      const mensaje = err instanceof Error ? err.message : String(err)
      const backoff = BACKOFF_MS[Math.min(nuevosIntentos - 1, BACKOFF_MS.length - 1)]

      if (nuevosIntentos >= MAX_INTENTOS) {
        console.error(`[chain] Evento abandonado tras ${MAX_INTENTOS} intentos:`, pending.id, mensaje)
      }

      await prisma.pendingChainEvent.update({
        where: { id: pending.id },
        data: {
          intentos: nuevosIntentos,
          ultimoError: mensaje,
          nextRetryAt: new Date(Date.now() + backoff),
        },
      })
    }
  }
}

// ── Verificación de integridad ────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean
  totalEvents: number
  brokenAt?: number
  brokenEventId?: string
}

export async function verifyChain(): Promise<VerificationResult> {
  const events = await prisma.chainEvent.findMany({ orderBy: { sequence: 'asc' } })

  let expectedHashPrevio = GENESIS_HASH

  for (const ev of events) {
    if (ev.hashPrevio !== expectedHashPrevio) {
      return { valid: false, totalEvents: events.length, brokenAt: ev.sequence, brokenEventId: ev.id }
    }

    const recomputed = computeEventHash(
      ev.sequence,
      ev.tipo,
      ev.entidad,
      ev.entidadId,
      ev.payload as Prisma.InputJsonObject,
      ev.hashPrevio,
      ev.createdAt,
    )

    if (recomputed !== ev.hashPropio) {
      return { valid: false, totalEvents: events.length, brokenAt: ev.sequence, brokenEventId: ev.id }
    }

    expectedHashPrevio = ev.hashPropio
  }

  return { valid: true, totalEvents: events.length }
}
