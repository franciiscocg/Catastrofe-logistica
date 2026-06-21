import { db } from './index'

export async function savePublicSnapshot<T>(key: string, value: T): Promise<T> {
  try {
    await db.publicSnapshots.put({ key, value, updatedAt: Date.now() })
  } catch {
    // IndexedDB puede estar deshabilitado (p. ej. navegación privada).
  }
  return value
}

export async function readPublicSnapshot<T>(key: string, fallback: T): Promise<T> {
  try {
    const snapshot = await db.publicSnapshots.get(key)
    return snapshot ? snapshot.value as T : fallback
  } catch {
    return fallback
  }
}
