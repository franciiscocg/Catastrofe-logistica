import { useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS, Role } from '@/types/auth.types'

const ROLE_ACCENTS: Record<string, {
  border: string
  eyebrow: string
  button: string
  dot: string
}> = {
  ciudadano: {
    border: 'border-blue-500',
    eyebrow: 'text-blue-700',
    button: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    dot: 'bg-blue-500',
  },
  voluntario: {
    border: 'border-green-500',
    eyebrow: 'text-green-700',
    button: 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100',
    dot: 'bg-green-500',
  },
  puesto: {
    border: 'border-amber-500',
    eyebrow: 'text-amber-700',
    button: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    dot: 'bg-amber-500',
  },
  coordinador: {
    border: 'border-purple-500',
    eyebrow: 'text-purple-700',
    button: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100',
    dot: 'bg-purple-500',
  },
}

const DEFAULT_ACCENT = {
  border: 'border-slate-400',
  eyebrow: 'text-slate-600',
  button: 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100',
  dot: 'bg-slate-500',
}

const API_ROLE_TO_ROLE: Record<string, Role> = {
  CIUDADANO: Role.CIUDADANO,
  VOLUNTARIO: Role.VOLUNTARIO,
  PUESTO_EMERGENCIA: Role.PUESTO,
  COORDINADOR: Role.COORDINADOR,
}

function getFallbackRole(roles: string[] = []) {
  const priority = [Role.COORDINADOR, Role.PUESTO, Role.VOLUNTARIO, Role.CIUDADANO]
  const normalized = roles.map((role) => API_ROLE_TO_ROLE[role] ?? role).filter(Boolean) as Role[]
  return priority.find((role) => normalized.includes(role)) ?? null
}

export default function AppShell() {
  const { accessTokenExpiresAt, clearRole, selectedRole, user } = useAuthStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const handleChangeRole = () => {
    clearRole()
    setProfileOpen(false)
    navigate('/')
  }

  const handleGoToProfile = () => {
    setProfileOpen(false)
    navigate('/perfil')
  }

  const effectiveRole = selectedRole ?? getFallbackRole(user?.roles)
  const roleLabel = effectiveRole ? ROLE_LABELS[effectiveRole as Role] : ''
  const accent = effectiveRole ? (ROLE_ACCENTS[effectiveRole] ?? DEFAULT_ACCENT) : DEFAULT_ACCENT
  const sessionExpiry = accessTokenExpiresAt
    ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(accessTokenExpiresAt))
    : null
  const displayName = user ? `${user.nombre} ${user.apellidos}`.trim() : 'Sesion activa'
  const initials = user
    ? `${user.nombre?.[0] ?? ''}${user.apellidos?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'
  const phoneStatus = user?.telefono ? user.telefono : 'Telefono pendiente'

  useEffect(() => {
    if (!profileOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [profileOpen])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="safe-top border-b border-slate-200 bg-white">
        <div className={`flex min-h-[64px] items-center justify-between gap-3 border-l-4 px-4 py-2.5 ${accent.border}`}>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${accent.dot}`} />
              <p className={`truncate text-xs font-semibold uppercase tracking-wide ${accent.eyebrow}`}>
                {roleLabel || 'Sesion'}
              </p>
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">
              {displayName}
            </p>
          </div>

          <div ref={profileMenuRef} className="relative flex flex-shrink-0 items-center">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
              aria-label="Abrir perfil operativo"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-36 truncate text-xs font-semibold text-slate-900">{user?.nombre ?? 'Perfil'}</span>
                <span className="block max-w-36 truncate text-[11px] text-slate-500">{user?.telefono ? 'Contacto listo' : 'Completar perfil'}</span>
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="border-b border-slate-100 px-2 pb-3 pt-2">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-slate-950 text-sm font-semibold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{displayName}</p>
                      <p className="truncate text-xs text-slate-500">{user?.email ?? 'Sesion activa'}</p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 px-2 py-1.5">
                      <dt className="font-medium text-slate-500">Rol</dt>
                      <dd className="mt-0.5 truncate font-semibold text-slate-900">{roleLabel || 'Activo'}</dd>
                    </div>
                    <div className="rounded-md bg-slate-50 px-2 py-1.5">
                      <dt className="font-medium text-slate-500">Sesion</dt>
                      <dd className="mt-0.5 truncate font-semibold text-slate-900">{sessionExpiry ?? 'Activa'}</dd>
                    </div>
                    <div className="col-span-2 rounded-md bg-slate-50 px-2 py-1.5">
                      <dt className="font-medium text-slate-500">Contacto operativo</dt>
                      <dd className={`mt-0.5 truncate font-semibold ${user?.telefono ? 'text-slate-900' : 'text-amber-700'}`}>{phoneStatus}</dd>
                    </div>
                  </dl>
                </div>

                <div className="grid gap-1 pt-2">
                  <button
                    type="button"
                    onClick={handleGoToProfile}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                  >
                    Editar perfil
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-slate-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                  {selectedRole !== 'coordinador' && (
                    <button
                      type="button"
                      onClick={handleChangeRole}
                      className={`flex w-full items-center justify-between rounded-md border px-2 py-2 text-left text-sm font-semibold transition-colors ${accent.button}`}
                    >
                      Cambiar rol
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17 2l4 4-4 4" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <path d="M7 22l-4-4 4-4" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
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
