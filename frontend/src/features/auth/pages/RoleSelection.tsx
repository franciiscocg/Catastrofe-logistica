import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Role, ROLE_ROUTES, ROLE_REQUIRES_AUTH } from '@/types/auth.types'
import RoleCard, { type RoleCardConfig } from '../components/RoleCard'

const ROLES: RoleCardConfig[] = [
  {
    role: Role.CIUDADANO,
    title: 'Ciudadano',
    description: 'Busca puestos de ayuda cercanos, consulta qué hay disponible y reporta el estado de las calles.',
    icon: '🏠',
    color: 'blue',
    requiresAuth: false,
    features: [
      'Ver puestos de emergencia cercanos',
      'Consultar inventario disponible',
      'Reportar calles cortadas o accesibles',
      'Calcular rutas seguras',
    ],
  },
  {
    role: Role.VOLUNTARIO,
    title: 'Voluntario / Donante',
    description: 'Transporta donaciones a los puestos que más lo necesitan o apúntate a tareas de trabajo físico.',
    icon: '🚗',
    color: 'green',
    requiresAuth: true,
    features: [
      'Registrar vehículo y productos a donar',
      'Recibir asignación optimizada de destino',
      'Verificar entrega con código QR',
      'Apuntarse a tareas de limpieza y apoyo',
    ],
  },
  {
    role: Role.PUESTO,
    title: 'Puesto de Emergencia',
    description: 'Gestiona un punto de distribución: controla el inventario, publica necesidades y coordina voluntarios.',
    icon: '🏪',
    color: 'amber',
    requiresAuth: true,
    features: [
      'Gestionar inventario disponible y necesario',
      'Verificar recepciones con QR',
      'Publicar necesidades urgentes',
      'Coordinar voluntarios laborales',
    ],
  },
  {
    role: Role.COORDINADOR,
    title: 'Coordinador',
    description: 'Crea y gestiona la respuesta a la catástrofe: define prioridades, áreas y fases de la emergencia.',
    icon: '📋',
    color: 'purple',
    requiresAuth: true,
    features: [
      'Crear y configurar la catástrofe',
      'Definir áreas y puestos de emergencia',
      'Establecer prioridades de ayuda',
      'Supervisar operaciones en tiempo real',
    ],
  },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const { isAuthenticated, selectRole } = useAuthStore()

  const handleSelect = (role: Role) => {
    selectRole(role)
    const needsAuth = ROLE_REQUIRES_AUTH[role]

    if (needsAuth && !isAuthenticated) {
      navigate(`/auth/login?role=${role}`)
    } else {
      navigate(ROLE_ROUTES[role])
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-lg mx-auto px-4 py-8 safe-top">

        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white text-3xl mb-4 shadow-lg">
            🆘
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Catástrofe Logística</h1>
          <p className="mt-2 text-gray-500 text-sm leading-relaxed">
            Coordinación de ayuda humanitaria en emergencias
          </p>
        </div>

        {/* Pregunta */}
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-gray-800">¿Cómo quieres participar?</h2>
          <p className="text-sm text-gray-500 mt-0.5">Elige tu rol para acceder a las funciones correspondientes</p>
        </div>

        {/* Tarjetas de rol */}
        <div className="space-y-3">
          {ROLES.map((config) => (
            <RoleCard key={config.role} config={config} onSelect={handleSelect} />
          ))}
        </div>

        {/* Nota offline */}
        <div className="mt-6 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="text-lg flex-shrink-0">📵</span>
          <p className="text-xs text-gray-500 leading-relaxed">
            La aplicación funciona <strong>sin conexión</strong>. Los datos se sincronizan automáticamente cuando recuperes el internet.
          </p>
        </div>

        {/* Si ya está autenticado, mostrar opción de cerrar sesión */}
        {isAuthenticated && (
          <div className="mt-4 text-center">
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
