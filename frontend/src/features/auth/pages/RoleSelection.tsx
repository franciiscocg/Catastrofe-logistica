import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Role, ROLE_ROUTES } from '@/types/auth.types'
import RoleCard, { type RoleCardConfig } from '../components/RoleCard'
import RoleInfoModal, { type RoleInfoData } from '../components/RoleInfoModal'

interface RoleConfig extends RoleCardConfig {
  info: RoleInfoData
}

const ROLES_BASE: Omit<RoleConfig, 'badge'>[] = [
  {
    role: Role.CIUDADANO,
    title: 'Ciudadano',
    subtitle: 'Busco ayuda o informacion',
    icon: '👤',
    color: 'blue',
    requiresAuth: true,
    info: {
      title: 'Ciudadano',
      icon: '👤',
      color: 'blue',
      what: 'Eres una persona afectada por la emergencia que necesita ayuda, informacion o quiere reportar el estado de las calles de su zona.',
      canDo: [
        'Ver los puestos de ayuda mas cercanos a ti',
        'Consultar que productos hay disponibles en cada puesto',
        'Reportar si una calle esta cortada o accesible',
        'Calcular rutas seguras para desplazarte',
      ],
      whenToUse: 'Usalo si eres vecino de la zona afectada y necesitas encontrar ayuda o informarte sobre la situacion.',
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
      what: 'Eres una persona que quiere colaborar en la respuesta a la emergencia, transportando donaciones o apoyando con trabajo fisico en la zona.',
      canDo: [
        'Transportar donaciones al puesto que mas las necesita',
        'Recibir instrucciones optimizadas sobre a donde ir',
        'Verificar entregas con codigo QR',
        'Apuntarte a tareas de limpieza y apoyo fisico',
      ],
      whenToUse: 'Usalo si tienes tiempo libre y ganas de ayudar, con o sin vehiculo.',
    },
  },
  {
    role: Role.PUESTO,
    title: 'Puesto de Emergencia',
    subtitle: 'Gestiono un punto de distribucion',
    icon: '🏪',
    color: 'amber',
    requiresAuth: true,
    info: {
      title: 'Puesto de Emergencia',
      icon: '🏪',
      color: 'amber',
      what: 'Eres el responsable de un punto de distribucion de ayuda: una tienda, un local o cualquier lugar donde se repartan productos a los vecinos afectados.',
      canDo: [
        'Gestionar el inventario de productos disponibles',
        'Publicar que productos necesitas con urgencia',
        'Verificar la llegada de donaciones mediante codigo QR',
        'Coordinar a los voluntarios que trabajan en tu puesto',
      ],
      whenToUse: 'Requiere solicitud previa aprobada por el coordinador.',
    },
  },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const { isAuthenticated, user, puestoId, selectRole, logout } = useAuthStore()
  const [infoRole, setInfoRole] = useState<Role | null>(null)

  // puestoId solo existe cuando el coordinador ha aprobado la solicitud y se ha creado el puesto
  const hasPuesto = Boolean(puestoId)

  const roles: RoleConfig[] = ROLES_BASE.map((r) => {
    if (r.role === Role.PUESTO) {
      return {
        ...r,
        badge: hasPuesto
          ? { text: 'Acceso aprobado', className: 'bg-green-100 text-green-700' }
          : { text: 'Requiere aprobacion del coordinador', className: 'bg-amber-100 text-amber-700' },
      }
    }
    return r
  })

  const activeInfo = infoRole ? (roles.find((r) => r.role === infoRole)?.info ?? null) : null

  const handleSelect = (role: Role) => {
    if (!isAuthenticated) {
      selectRole(role)
      navigate(`/auth/login?role=${role}`)
      return
    }

    if (role === Role.PUESTO) {
      selectRole(role)
      if (hasPuesto) {
        navigate(ROLE_ROUTES[role])
      } else {
        navigate('/auth/registro-puesto')
      }
      return
    }
    selectRole(role)
    navigate(ROLE_ROUTES[role])
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-lg mx-auto px-4 py-8 safe-top">

          {isAuthenticated && user && (
            <div
              className="mb-6 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <span className="text-2xl flex-shrink-0" aria-hidden="true">👋</span>
              <p className="text-blue-800 font-medium text-base">
                Bienvenido/a, <strong>{user.nombre}</strong>! Selecciona como quieres continuar.
              </p>
            </div>
          )}

          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">Como quieres participar?</h2>
            <p className="text-gray-500 mt-1 text-base">
              Elige tu rol para acceder a las funciones correspondientes
            </p>
          </div>

          <div className="space-y-4" role="list" aria-label="Roles disponibles">
            {roles.map((config) => (
              <div key={config.role} role="listitem">
                <RoleCard
                  config={config}
                  onSelect={handleSelect}
                  onInfo={(role) => setInfoRole(role)}
                />
              </div>
            ))}
          </div>

          {isAuthenticated && (
            <div className="mt-4 text-center">
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-red-600 transition-colors py-2 px-4 rounded-lg"
              >
                Cerrar sesion
              </button>
            </div>
          )}
        </div>
      </div>

      <RoleInfoModal
        isOpen={infoRole !== null}
        onClose={() => setInfoRole(null)}
        info={activeInfo}
      />
    </>
  )
}
