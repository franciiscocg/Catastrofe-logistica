export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return {
    usedMB: Math.round(usage / 1024 / 1024),
    totalMB: Math.round(quota / 1024 / 1024),
    percentUsed: quota > 0 ? Math.round((usage / quota) * 100) : 0,
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}
