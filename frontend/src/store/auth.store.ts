import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Role, User } from '@/types/auth.types'

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: string | null
  selectedRole: Role | null
  isAuthenticated: boolean
  puestoId: string | null           // puesto del usuario si tiene rol PUESTO
  login: (user: User, accessToken: string, puestoId?: string, refreshToken?: string, accessTokenExpiresAt?: string) => void
  setSession: (user: User, accessToken: string, refreshToken: string, accessTokenExpiresAt: string) => void
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
      refreshToken: null,
      accessTokenExpiresAt: null,
      selectedRole: null,
      isAuthenticated: false,
      puestoId: null,

      login: (user, accessToken, puestoId, refreshToken, accessTokenExpiresAt) =>
        set({
          user,
          accessToken,
          refreshToken: refreshToken ?? null,
          accessTokenExpiresAt: accessTokenExpiresAt ?? null,
          isAuthenticated: true,
          puestoId: puestoId ?? null,
        }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, accessTokenExpiresAt: null, selectedRole: null, isAuthenticated: false, puestoId: null }),

      setSession: (user, accessToken, refreshToken, accessTokenExpiresAt) =>
        set({ user, accessToken, refreshToken, accessTokenExpiresAt, isAuthenticated: true }),

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
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
        selectedRole: state.selectedRole,
        isAuthenticated: state.isAuthenticated,
        puestoId: state.puestoId,
      }),
    },
  ),
)
