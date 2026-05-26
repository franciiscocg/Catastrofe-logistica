import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteCache = vi.fn()

describe('cache privada de la API', () => {
  beforeEach(() => {
    vi.resetModules()
    deleteCache.mockReset().mockResolvedValue(true)
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: deleteCache },
    })
  })

  it('elimina el cache heredado que pudo contener respuestas autenticadas', async () => {
    const { clearSensitiveApiCaches } = await import('../../../frontend/src/lib/api/client')

    await clearSensitiveApiCaches()

    expect(deleteCache).toHaveBeenCalledWith('api-cache')
  })

  it('elimina el cache incluso si la peticion de logout falla', async () => {
    const { apiClient, endSession } = await import('../../../frontend/src/lib/api/client')
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('sin red'))

    await expect(endSession()).rejects.toThrow('sin red')

    expect(deleteCache).toHaveBeenCalledWith('api-cache')
  })
})
