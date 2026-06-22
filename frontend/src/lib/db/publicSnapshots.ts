import { db } from './index'

export async function savePublicSnapshot<T>(key: string, value: T): Promise<T> {
  try {
    await db.publicSnapshots.put({ key, value, updatedAt: Date.now() })
    if (key.startsWith('route:')) {
      const routes = (await db.publicSnapshots.toArray())
        .filter((entry) => entry.key.startsWith('route:'))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      if (routes.length > 200) await db.publicSnapshots.bulkDelete(routes.slice(200).map((entry) => entry.key))
    }
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
