import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteMany } = vi.hoisted(() => ({ deleteMany: vi.fn() }))

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: { idempotencyRecord: { deleteMany } },
}))

import { cleanupExpiredRecords } from '../../../backend/src/lib/maintenanceWorker.js'

describe('mantenimiento de idempotencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('elimina exclusivamente registros cuya caducidad ya ha pasado', async () => {
    const now = new Date('2026-06-21T12:00:00.000Z')
    deleteMany.mockResolvedValue({ count: 4 })

    await expect(cleanupExpiredRecords(now)).resolves.toBe(4)
    expect(deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } })
  })
})
