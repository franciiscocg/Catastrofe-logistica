import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Role, ROLE_ROUTES, ROLE_REQUIRES_AUTH } from '@/types/auth.types'
import RoleCard, { type RoleCardConfig } from '../components/RoleCard'
import RoleInfoModal, { type RoleInfoData } from '../components/RoleInfoModal'

interface RoleConfig extends RoleCardConfig {
  info: RoleInfoData
}

const ROLES: RoleConfig[] = [
  {
    role: Role.CIUDADANO,
    title: 'Ciudadano',
    subtitle: 'Busco ayuda o información',
    icon: '👤',
    color: 'blue',
    requiresAuth: true,
    info: {
      title: 'Ciudadano',
      icon: '👤',
      color: 'blue',
      what: 'Eres una persona afectada por la emergencia que necesita ayuda, información o quiere reportar el estado de las calles de su zona.',
      canDo: [
        'Ver los puestos de ayuda más cercanos a ti',
        'Consultar qué productos hay disponibles en cada puesto',
        'Reportar si una calle está cortada o accesible',
        'Calcular rutas seguras para desplazarte',
      ],
      whenToUse:
        'Úsalo si eres vecino de la zona afectada y necesitas encontrar ayuda o informarte sobre la situación. Necesitarás crear una cuenta para acceder.',
    },
  },
  {
    role: Role.VOLUNTARIO,
    title: 'Voluntario',
    subtitle: 'Quiero ayudar y contribuir',
    icon: '🤝',
    color: 'green',
    requiresAuth: true,
    info: {
      title: 'Voluntario',
      icon: '🤝',
      color: 'green',
      what: 'Eres una persona que quiere colaborar en la respuesta a la emergencia, transportando donaciones o apoyando con trabajo físico en la zona.',
      canDo: [
        'Transportar donaciones al puesto que más las necesita',
        'Recibir instrucciones optimizadas sobre a dónde ir',
        'Verificar entregas con código QR',
        'Apuntarte a tareas de limpieza y apoyo físico',
      ],
      whenToUse:
        'Úsalo si tienes tiempo libre y ganas de ayudar, con o sin vehículo. Necesitarás crear una cuenta para coordinar las tareas contigo.',
    },
  },
  {
    role: Role.PUESTO,
    title: 'Puesto de Emergencia',
    subtitle: 'Gestiono un punto de distribución',
    icon: '🏪',
    color: 'amber',
    requiresAuth: true,
    info: {
      title: 'Puesto de Emergencia',
      icon: '🏪',
      color: 'amber',
      what: 'Eres el responsable de un punto de distribución de ayuda: una tienda, un local o cualquier lugar donde se repartan productos a los vecinos afectados.',
      canDo: [
        'Gestionar el inventario de productos disponibles',
        'Publicar qué productos necesitas con urgencia',
        'Verificar la llegada de donaciones mediante código QR',
        'Coordinar a los voluntarios que trabajan en tu puesto',
      ],
      whenToUse:
        'Úsalo si estás a cargo de un punto de reparto de ayuda y necesitas gestionar el stock y coordinar voluntarios. Requiere registro previo.',
    },
  },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const { isAuthenticated, user, selectRole, logout } = useAuthStore()
  const [infoRole, setInfoRole] = useState<Role | null>(null)

  const activeInfo = infoRole ? (ROLES.find((r) => r.role === infoRole)?.info ?? null) : null

  const handleSelect = (role: Role) => {
    selectRole(role)
    if (ROLE_REQUIRES_AUTH[role] && !isAuthenticated) {
      navigate(`/auth/login?role=${role}`)
    } else {
      navigate(ROLE_ROUTES[role])
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-lg mx-auto px-4 py-8 safe-top">

          {/* Personalized welcome after login */}
          {isAuthenticated && user && (
            <div
              className="mb-6 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <span className="text-2xl flex-shrink-0" aria-hidden="true">👋</span>
              <p className="text-blue-800 font-medium text-base">
                ¡Bienvenido/a, <strong>{user.nombre}</strong>! Selecciona cómo quieres continuar.
              </p>
            </div>
          )}

          {/* Section heading */}
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">¿Cómo quieres participar?</h2>
            <p className="text-gray-500 mt-1 text-base">
              Elige tu rol para acceder a las funciones correspondientes
            </p>
          </div>

          {/* Role cards */}
          <div className="space-y-4" role="list" aria-label="Roles disponibles">
            {ROLES.map((config) => (
              <div key={config.role} role="listitem">
                <RoleCard
                  config={config}
                  onSelect={handleSelect}
                  onInfo={(role) => setInfoRole(role)}
                />
              </div>
            ))}
          </div>

          {/* Logout option when authenticated */}
          {isAuthenticated && (
            <div className="mt-4 text-center">
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-red-600 transition-colors py-2 px-4 rounded-lg"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Role info modal */}
      <RoleInfoModal
        isOpen={infoRole !== null}
        onClose={() => setInfoRole(null)}
        info={activeInfo}
      />
    </>
  )
}
