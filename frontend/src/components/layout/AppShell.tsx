import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS } from '@/types/auth.types'
import type { Role } from '@/types/auth.types'

const ROLE_COLORS: Record<string, string> = {
  ciudadano:    'bg-blue-100 text-blue-700',
  voluntario:   'bg-green-100 text-green-700',
  puesto:       'bg-amber-100 text-amber-700',
  coordinador:  'bg-purple-100 text-purple-700',
}

const HEADER_COLORS: Record<string, string> = {
  ciudadano:   'bg-blue-600',
  voluntario:  'bg-green-600',
  puesto:      'bg-amber-500',
  coordinador: 'bg-purple-600',
}

const ROLE_ICONS: Record<string, string> = {
  ciudadano:   '🏠',
  voluntario:  '🤝',
  puesto:      '🏥',
  coordinador: '📋',
}

export default function AppShell() {
  const { clearRole, selectedRole, user } = useAuthStore()
  const navigate = useNavigate()

  const handleChangeRole = () => {
    clearRole()
    navigate('/')
  }

  const roleLabel  = selectedRole ? ROLE_LABELS[selectedRole as Role] : ''
  const roleColor  = selectedRole ? (ROLE_COLORS[selectedRole] ?? 'bg-gray-100 text-gray-700') : 'bg-gray-100 text-gray-700'
  const roleIcon   = selectedRole ? (ROLE_ICONS[selectedRole] ?? '👤') : '👤'
  const headerBg   = selectedRole ? (HEADER_COLORS[selectedRole] ?? 'bg-gray-700') : 'bg-gray-700'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className={`flex items-center justify-between px-4 py-2 ${headerBg} safe-top`}>

        <div className="flex items-center gap-2">
          <span className="text-lg">{roleIcon}</span>
          <span className="text-sm font-semibold text-white">{roleLabel}</span>
          {user && (
            <span className="text-xs text-white/60 hidden sm:block">
              · {user.nombre} {user.apellidos}
            </span>
          )}
        </div>

        {selectedRole !== 'coordinador' && (
          <button
            onClick={handleChangeRole}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            Cambiar rol
          </button>
        )}

      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
