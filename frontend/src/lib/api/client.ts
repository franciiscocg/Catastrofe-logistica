import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string | null> | null = null
const LEGACY_PRIVATE_API_CACHES = ['api-cache']

// El refresh token se guarda en localStorage y se reenvia en el cuerpo de
// /refresh y /logout. Es necesario porque el frontend y el backend estan en
// sitios distintos (Render): la cookie httpOnly de refresh seria de terceros y
// los navegadores la bloquean, cerrando la sesion al recargar.
const REFRESH_TOKEN_STORAGE_KEY = 'catlogistica:refresh-token'

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistRefreshToken(token: string) {
  try {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token)
  } catch {
    // Si el navegador bloquea localStorage seguimos en memoria durante la sesion.
  }
}

function clearStoredRefreshToken() {
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  } catch {
    /* nada que limpiar si no hay acceso a localStorage */
  }
}

interface SessionResponse {
  user: any
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken?: string
}

export async function clearSensitiveApiCaches() {
  if (!('caches' in globalThis)) return

  await Promise.all(LEGACY_PRIVATE_API_CACHES.map((cacheName) => globalThis.caches.delete(cacheName)))
}

async function refreshAccessToken() {
  refreshPromise ??= apiClient.post<SessionResponse>('/api/auth/refresh', { refreshToken: getStoredRefreshToken() })
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.accessToken, data.accessTokenExpiresAt)
      return data.accessToken
    })
    .catch(async () => {
      clearStoredRefreshToken()
      await clearSensitiveApiCaches()
      useAuthStore.getState().logout()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function restoreSession() {
  try {
    await clearSensitiveApiCaches()
    // Sin refresh token guardado no hay sesion que restaurar: evitamos un 401
    // innecesario y dejamos la sesion inicializada como cerrada.
    if (!getStoredRefreshToken()) {
      useAuthStore.getState().logout()
      return
    }
    await refreshAccessToken()
  } catch {
    useAuthStore.getState().logout()
  }
}

export async function endSession() {
  try {
    await apiClient.post('/api/auth/logout', { refreshToken: getStoredRefreshToken() })
  } finally {
    clearStoredRefreshToken()
    await clearSensitiveApiCaches()
    useAuthStore.getState().logout()
  }
}

apiClient.interceptors.response.use(
  (response) => {
    // Punto unico de captura: si una respuesta de /api/auth/* trae refreshToken,
    // lo guardamos (login, register, registro-puesto y refresh).
    const url = response.config?.url ?? ''
    const token = (response.data as { refreshToken?: string } | undefined)?.refreshToken
    if (token && url.includes('/api/auth/')) persistRefreshToken(token)
    return response
  },
  async (error) => {
    const originalRequest = error.config
    const isRefreshRequest = originalRequest?.url?.includes('/api/auth/refresh')
    const isAuthenticationRequest = originalRequest?.url?.startsWith('/api/auth/')
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthenticationRequest) {
      originalRequest._retry = true
      const token = await refreshAccessToken()
      if (token) {
        originalRequest.headers = originalRequest.headers ?? {}
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest)
      }
    }

    if (error.response?.status === 401 && !isRefreshRequest) {
      await clearSensitiveApiCaches()
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  },
)
