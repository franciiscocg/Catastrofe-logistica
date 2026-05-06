import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Role, ROLE_ROUTES } from '@/types/auth.types'

interface RoleOption {
  role: Role
  title: string
  description: string
  icon: string
  accentColor: string
  hoverBorder: string
  requiredBackendRole: string
}

const ALL_ROLE_OPTIONS: RoleOption[] = [
  {
    role: Role.CIUDADANO,
    title: 'Ciudadano',
    description: 'Busca puestos de ayuda cercanos, consulta qué hay disponible y reporta el estado de las calles.',
    icon: '🏠',
    accentColor: 'group-hover:text-blue-700',
    hoverBorder: 'hover:border-blue-300 hover:bg-blue-50',
    requiredBackendRole: 'CIUDADANO',
  },
  {
    role: Role.VOLUNTARIO,
    title: 'Voluntario / Donante',
    description: 'Transporta donaciones a los puestos que más lo necesitan o apúntate a tareas de trabajo físico.',
    icon: '🚗',
    accentColor: 'group-hover:text-green-700',
    hoverBorder: 'hover:border-green-300 hover:bg-green-50',
    requiredBackendRole: 'VOLUNTARIO',
  },
  {
    role: Role.PUESTO,
    title: 'Puesto de Emergencia',
    description: 'Gestiona el inventario, publica necesidades y coordina voluntarios en tu punto de distribución.',
    icon: '🏪',
    accentColor: 'group-hover:text-amber-700',
    hoverBorder: 'hover:border-amber-300 hover:bg-amber-50',
    requiredBackendRole: 'PUESTO_EMERGENCIA',
  },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const { isAuthenticated, user, selectRole, logout } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth/login', { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (!isAuthenticated || !user) return null

  const userBackendRoles: string[] = user.roles ?? []

  const visibleOptions = ALL_ROLE_OPTIONS.filter((opt) =>
    userBackendRoles.includes(opt.requiredBackendRole),
  )

  const hasPuesto = userBackendRoles.includes('PUESTO_EMERGENCIA')

  const handleSelectRole = (role: Role) => {
    selectRole(role)
    navigate(ROLE_ROUTES[role])
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full py-8">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white text-2xl mb-3 shadow-md">
            🆘
          </div>
          <h1 className="text-xl font-bold text-gray-900">¿Cómo quieres participar?</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hola, <strong>{user.nombre}</strong>. Elige tu rol para este acceso.
          </p>
        </div>

        <div className="space-y-3">
          {visibleOptions.map(({ role, title, description, icon, accentColor, hoverBorder }) => (
            <button
              key={role}
              onClick={() => handleSelectRole(role)}
              className={`w-full text-left bg-white border border-gray-200 rounded-2xl p-4 shadow-sm transition-all group ${hoverBorder}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{icon}</span>
                <div className="flex-1">
                  <p className={`font-semibold text-gray-900 ${accentColor}`}>{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
                </div>
                <span className="text-gray-300 ml-1 mt-0.5 text-lg">›</span>
              </div>
            </button>
          ))}

          {!hasPuesto && (
            <>
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">o</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                onClick={() => navigate('/auth/registro-puesto')}
                className="w-full text-left bg-white border border-gray-200 rounded-2xl p-4 shadow-sm transition-all group hover:border-amber-300 hover:bg-amber-50"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏪</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 group-hover:text-amber-700">Registrar puesto de emergencia</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Tu solicitud será verificada antes de activarse.</p>
                  </div>
                  <span className="text-gray-300 ml-1 mt-0.5 text-lg">›</span>
                </div>
              </button>
            </>
          )}
        </div>

        <div className="mt-6 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="text-base flex-shrink-0">📵</span>
          <p className="text-xs text-gray-500 leading-relaxed">
            La aplicación funciona <strong>sin conexión</strong>. Los datos se sincronizan automáticamente cuando recuperes el internet.
          </p>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
