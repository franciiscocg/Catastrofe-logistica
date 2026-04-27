import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS } from '@/types/auth.types'
import ConnectivityBanner from './ConnectivityBanner'

const ROLE_COLORS = {
  ciudadano: 'bg-blue-600',
  voluntario: 'bg-green-600',
  puesto: 'bg-amber-500',
  coordinador: 'bg-purple-600',
}

export default function AppShell() {
  const { selectedRole, user, clearRole } = useAuthStore()
  const navigate = useNavigate()

  const handleChangeRole = () => {
    clearRole()
    navigate('/')
  }

  const roleColor = selectedRole ? ROLE_COLORS[selectedRole] : 'bg-blue-600'
  const roleLabel = selectedRole ? ROLE_LABELS[selectedRole] : ''

  return (
    <div className="flex flex-col min-h-screen">
      <ConnectivityBanner />

      <header className={`${roleColor} text-white safe-top`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs text-white/70 uppercase tracking-wide">Catástrofe Logística</p>
            <p className="font-semibold text-sm">{roleLabel}</p>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-white/80 hidden sm:block">
                {user.nombre}
              </span>
            )}
            <button
              onClick={handleChangeRole}
              className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
            >
              Cambiar rol
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
