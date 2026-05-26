import { beforeEach, describe, expect, it, vi } from 'vitest'

const { events, pendingCreate, timestampHash } = vi.hoisted(() => ({
  events: [] as Array<Record<string, any>>,
  pendingCreate: vi.fn(),
  timestampHash: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => {
  const prisma = {
    chainEvent: {
      findFirst: vi.fn(() => events.at(-1) ?? null),
      findMany: vi.fn(() => events),
      create: vi.fn(({ data }) => {
        const event = { id: `event-${events.length + 1}`, ...data }
        events.push(event)
        return event
      }),
      update: vi.fn(),
    },
    pendingChainEvent: { create: pendingCreate },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  }
  return { prisma }
})

vi.mock('../../../backend/src/lib/tsa.js', () => ({ timestampHash }))

import { prisma } from '../../../backend/src/lib/prisma.js'
import { appendChainEvent, verifyChain } from '../../../backend/src/lib/chain.js'

const input = {
  tipo: 'DONACION_CREADA' as const,
  entidad: 'donacion',
  entidadId: 'don-1',
  payload: { cantidad: 5, unidad: 'litros' },
}

describe('cadena publica', () => {
  beforeEach(() => {
    events.length = 0
    vi.clearAllMocks()
    timestampHash.mockRejectedValue(new Error('TSA no disponible'))
    ;(prisma.$transaction as any).mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma))
  })

  it('encadena eventos y verifica una cadena integra', async () => {
    await appendChainEvent(input)
    await appendChainEvent({ ...input, tipo: 'DONACION_EN_CAMINO' })

    expect(events).toHaveLength(2)
    expect(events[1].hashPrevio).toBe(events[0].hashPropio)
    await expect(verifyChain()).resolves.toEqual({ valid: true, totalEvents: 2 })
  })

  it('detecta una manipulacion del payload ya registrado', async () => {
    await appendChainEvent(input)
    events[0].payload = { cantidad: 500, unidad: 'litros' }

    await expect(verifyChain()).resolves.toMatchObject({
      valid: false,
      brokenAt: 1,
      brokenEventId: 'event-1',
    })
  })

  it('encola el evento cuando no puede persistir en la cadena', async () => {
    ;(prisma.$transaction as any).mockRejectedValueOnce(new Error('database unavailable'))

    await appendChainEvent(input)

    expect(pendingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ payload: input, ultimoError: 'database unavailable' }),
    })
  })
})
