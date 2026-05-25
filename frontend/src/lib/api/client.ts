import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise: Promise<string | null> | null = null

interface SessionResponse {
  user: any
  accessToken: string
  accessTokenExpiresAt: string
}

async function refreshAccessToken() {
  refreshPromise ??= apiClient.post<SessionResponse>('/api/auth/refresh')
    .then(({ data }) => {
      useAuthStore.getState().setSession(data.user, data.accessToken, data.accessTokenExpiresAt)
      return data.accessToken
    })
    .catch(() => {
      useAuthStore.getState().logout()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export async function restoreSession() {
  await refreshAccessToken()
}

export async function endSession() {
  try {
    await apiClient.post('/api/auth/logout')
  } finally {
    useAuthStore.getState().logout()
  }
}

apiClient.interceptors.response.use(
  (response) => response,
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
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  },
)
