import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

function isSerializationConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'
}

export async function runSerializableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 2,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (attempt >= maxRetries || !isSerializationConflict(error)) throw error
    }
  }
}
