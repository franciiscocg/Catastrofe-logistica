import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Role, User } from '@/types/auth.types'

interface AuthStore {
  user: User | null
  accessToken: string | null
  accessTokenExpiresAt: string | null
  selectedRole: Role | null
  isAuthenticated: boolean
  isSessionInitialized: boolean
  puestoId: string | null           // puesto del usuario si tiene rol PUESTO
  login: (user: User, accessToken: string, puestoId?: string, accessTokenExpiresAt?: string) => void
  setSession: (user: User, accessToken: string, accessTokenExpiresAt: string) => void
  setPuestoId: (puestoId: string | null) => void
  logout: () => void
  selectRole: (role: Role) => void
  clearRole: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      selectedRole: null,
      isAuthenticated: false,
      isSessionInitialized: false,
      puestoId: null,

      login: (user, accessToken, puestoId, accessTokenExpiresAt) =>
        set({
          user,
          accessToken,
          accessTokenExpiresAt: accessTokenExpiresAt ?? null,
          isAuthenticated: true,
          isSessionInitialized: true,
          puestoId: puestoId ?? null,
        }),

      logout: () =>
        set({ user: null, accessToken: null, accessTokenExpiresAt: null, selectedRole: null, isAuthenticated: false, isSessionInitialized: true, puestoId: null }),

      setSession: (user, accessToken, accessTokenExpiresAt) =>
        set({ user, accessToken, accessTokenExpiresAt, isAuthenticated: true, isSessionInitialized: true }),

      setPuestoId: (puestoId) => set({ puestoId }),

      selectRole: (role) => set({ selectedRole: role }),

      clearRole: () => set({ selectedRole: null }),

      updateUser: (partial) => {
        const current = get().user
        if (current) set({ user: { ...current, ...partial } })
      },
    }),
    {
      name: 'catlogistica-auth',
      partialize: (state) => ({
        selectedRole: state.selectedRole,
        puestoId: state.puestoId,
      }),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<AuthStore>
        return {
          selectedRole: state.selectedRole ?? null,
          puestoId: state.puestoId ?? null,
        }
      },
    },
  ),
)
