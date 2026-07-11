import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteMany, withDistributedLock } = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  withDistributedLock: vi.fn(),
}))

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: { idempotencyRecord: { deleteMany } },
}))
vi.mock('../../../backend/src/lib/distributedLock.js', () => ({ withDistributedLock }))

import {
  cleanupExpiredRecords,
  startMaintenanceWorker,
  stopMaintenanceWorker,
} from '../../../backend/src/lib/maintenanceWorker.js'

describe('mantenimiento de idempotencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('elimina exclusivamente registros cuya caducidad ya ha pasado', async () => {
    const now = new Date('2026-06-21T12:00:00.000Z')
    deleteMany.mockResolvedValue({ count: 4 })

    await expect(cleanupExpiredRecords(now)).resolves.toBe(4)
    expect(deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } })
  })

  it('espera al ciclo activo antes de detener el worker', async () => {
    let finish!: () => void
    withDistributedLock.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ acquired: true, value: 0 })
    }))
    startMaintenanceWorker()
    let stopped = false
    const stopping = stopMaintenanceWorker().then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false)
    finish()
    await stopping
    expect(stopped).toBe(true)
  })
})
