import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS } from '@/types/auth.types'
import type { Role } from '@/types/auth.types'

const ROLE_ACCENTS: Record<string, {
  border: string
  eyebrow: string
  button: string
}> = {
  ciudadano: {
    border: 'border-blue-500',
    eyebrow: 'text-blue-700',
    button: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
  },
  voluntario: {
    border: 'border-green-500',
    eyebrow: 'text-green-700',
    button: 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100',
  },
  puesto: {
    border: 'border-amber-500',
    eyebrow: 'text-amber-700',
    button: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  },
  coordinador: {
    border: 'border-purple-500',
    eyebrow: 'text-purple-700',
    button: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100',
  },
}

const DEFAULT_ACCENT = {
  border: 'border-slate-400',
  eyebrow: 'text-slate-600',
  button: 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100',
}

export default function AppShell() {
  const { accessTokenExpiresAt, clearRole, selectedRole, user } = useAuthStore()
  const navigate = useNavigate()

  const handleChangeRole = () => {
    clearRole()
    navigate('/')
  }

  const roleLabel = selectedRole ? ROLE_LABELS[selectedRole as Role] : ''
  const accent = selectedRole ? (ROLE_ACCENTS[selectedRole] ?? DEFAULT_ACCENT) : DEFAULT_ACCENT
  const sessionExpiry = accessTokenExpiresAt
    ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(accessTokenExpiresAt))
    : null

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="safe-top border-b border-slate-200 bg-white">
        <div className={`flex flex-col gap-2 border-l-4 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between ${accent.border}`}>
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${accent.eyebrow}`}>
              {roleLabel || 'Sesión'}
            </p>
            {user ? (
              <>
                <p className="truncate text-sm font-semibold text-slate-950">
                  {user.nombre} {user.apellidos}
                </p>
                {sessionExpiry && <p className="text-[11px] text-slate-500">Sesion activa hasta {sessionExpiry}</p>}
              </>
            ) : (
              <p className="truncate text-sm font-semibold text-slate-950">Sesión activa</p>
            )}
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/perfil')}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Perfil
            </button>
            {selectedRole !== 'coordinador' && (
              <button
                onClick={handleChangeRole}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${accent.button}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                Cambiar rol
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
